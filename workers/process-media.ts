import sharp from 'sharp';
import { readCapture } from '../src/server/storage/capture';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { objectPath,fileHash } from '../src/server/storage/local';
import { type PreviewSize } from '../src/server/media-preview';
import type { Job,Processed } from '../src/server/job-store';
const run=promisify(execFile);
export type ProcessingStage='full'|'preview'|'playback';
const derivativeBase=(j:Job)=>`derivatives/${j.mediaId}/${j.generation}-${j.token}`;

async function thumbnails(previewKey:string,base:string){
 const preview=objectPath(previewKey),info=await sharp(preview).metadata();
 const sizes:PreviewSize[]=[];
 for(const width of [480,960]){
  if(Math.max(info.width!,info.height!)<=width)continue;
  const key=`${base}-${width}.jpg`;
  const output=await sharp(preview).resize({width,height:width,fit:'inside',withoutEnlargement:true}).jpeg({quality:78}).toFile(objectPath(key));
  sizes.push({key,width:output.width,height:output.height});
 }
 sizes.push({key:previewKey,width:info.width!,height:info.height!});
 return {previewSizes:sizes,previewWidth:info.width!,previewHeight:info.height!};
}
// Only delete this lease's outputs. Playback retries must retain the published poster.
export async function discardOutputs(j:Job){
 const base=derivativeBase(j);
 await Promise.all(['.jpg','-480.jpg','-960.jpg','.mp4'].map(ext=>rm(objectPath(base+ext),{force:true})));
 await rm(objectPath(base+'.jpg')+'.converted.png',{force:true});
}
export async function processMedia(j:Job,stage:ProcessingStage='full'):Promise<Processed>{
 const original=objectPath(j.key);
 if(await fileHash(original)!==j.sha256)throw Error('ORIGINAL_HASH_MISMATCH');
 const base=derivativeBase(j),previewKey=base+'.jpg',preview=objectPath(previewKey);
 await mkdir(dirname(preview),{recursive:true,mode:0o700});
 try{
  const {capturedText,capturedZone,captureSource,yoyotime}=await readCapture(original,j.kind);
  const captureMetadata={captureSource,yoyotime};
  if(j.kind==='image'){
   const render=(source:string)=>sharp(source,{limitInputPixels:100000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').jpeg({quality:88}).toFile(preview);
   try{await render(original);}
   catch(e){
    const fallback=preview+'.converted.png';
    if(process.platform==='darwin')await run('/usr/bin/sips',['-s','format','png',original,'--out',fallback],{timeout:60000,maxBuffer:1024*1024});
    else if(process.env.HEIF_CONVERT_PATH)await run(process.env.HEIF_CONVERT_PATH,[original,fallback],{timeout:60000,maxBuffer:1024*1024});
    else throw e;
    try{await render(fallback);}finally{await rm(fallback,{force:true});}
   }
   const variants=await thumbnails(previewKey,base);
   return {previewKey,playbackKey:null,capturedText,capturedZone,metadata:{...j.metadata,...variants,...captureMetadata,width:variants.previewWidth,height:variants.previewHeight,previewColor:'sRGB'}};
  }
  const probe=JSON.parse((await run(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',original],{timeout:30000,maxBuffer:4*1024*1024})).stdout);
  const video=probe.streams?.find((s:{codec_type:string})=>s.codec_type==='video');
  if(!video)throw Error('VIDEO_TRACK_MISSING');
  const hdr=['smpte2084','arib-std-b67'].includes(video.color_transfer);
  const scale="scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
  const filter=(hdr?'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,':'')+scale+',format=yuv420p';
  const metadata:Record<string,unknown>={...j.metadata,...captureMetadata,width:video.width,height:video.height,sourceCodec:video.codec_name,duration:Number(probe.format?.duration)||null,hdrSource:hdr,playbackColor:'SDR',rotation:video.side_data_list?.find((d:{rotation?:number})=>d.rotation!==undefined)?.rotation||0};
  let poster=j.previewKey;
  if(stage!=='playback'){
   // Decode just the first frame, including orientation and HDR tone mapping.
   await run(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-threads','1','-i',original,'-map','0:v:0','-vf',filter,'-frames:v','1','-threads','1','-filter_threads','1','-q:v','2',preview],{timeout:60000,maxBuffer:1024*1024});
   Object.assign(metadata,await thumbnails(previewKey,base));poster=previewKey;
  }
  if(!poster)throw Error('VIDEO_PREVIEW_MISSING');
  if(stage==='preview')return {previewKey:poster,playbackKey:null,capturedText,capturedZone,metadata};
  const playbackKey=base+'.mp4';
  // Keep full-resolution originals/posters; the streaming copy fits a phone and
  // a modest connection. Bound peaks as well as average quality, with short GOPs.
  const playbackFilter=filter.replace(scale,"scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
  const [numerator,denominator]=String(video.avg_frame_rate||'0/1').split('/').map(Number);
  const fps=numerator/(denominator||1);
  await run(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-threads','2','-i',original,'-map','0:v:0','-map','0:a:0?','-vf',playbackFilter,'-filter_threads','1','-c:v','libx264','-preset','fast','-crf','25','-maxrate','1600k','-bufsize','1600k','-g','60',...(fps>30?['-r','30']:[]),'-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1',objectPath(playbackKey)],{timeout:20*60*1000,maxBuffer:4*1024*1024});
  metadata.playbackProfile='mobile-v1';
  return {previewKey:poster,playbackKey,capturedText,capturedZone,metadata};
 }catch(error){await discardOutputs(j);throw error;}
}
// Generate lightweight variants for an already-ready legacy preview, without touching its original.
export async function resizeExistingPreview(previewKey:string,base:string){
 await mkdir(dirname(objectPath(base+'.jpg')),{recursive:true,mode:0o700});
 return thumbnails(previewKey,base);
}

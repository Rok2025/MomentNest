import sharp from 'sharp';
import exifr from 'exifr';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir,rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { objectPath,fileHash } from '../src/server/storage/local';
import type { Job,Processed } from '../src/server/job-store';
const run=promisify(execFile);
export async function processMedia(j:Job):Promise<Processed>{
 const original=objectPath(j.key);if(await fileHash(original)!==j.sha256)throw Error('ORIGINAL_HASH_MISMATCH');
 const base=`derivatives/${j.mediaId}/${j.generation}-${j.token}`,previewKey=base+'.jpg',preview=objectPath(previewKey);await mkdir(dirname(preview),{recursive:true,mode:0o700});
 try{
 let capturedText:string|null=null,capturedZone:string|null=null;
 if(j.kind==='image'){
  // No GPS fields are exposed in the application. Missing capture time remains unknown.
  try{const tags=await exifr.parse(original,{pick:['DateTimeOriginal','OffsetTimeOriginal'],reviveValues:false});if(tags?.DateTimeOriginal){capturedText=String(tags.DateTimeOriginal);capturedZone=tags.OffsetTimeOriginal?String(tags.OffsetTimeOriginal):null;}}catch{}
  let source=original;const fallback=preview+'.converted.png';
  try{await sharp(source,{limitInputPixels:100000000}).metadata();await sharp(source,{limitInputPixels:100000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').jpeg({quality:88}).toFile(preview);}
  catch(e){
   if(process.platform==='darwin')await run('/usr/bin/sips',['-s','format','png',original,'--out',fallback],{timeout:60000,maxBuffer:1024*1024});
   else if(process.env.HEIF_CONVERT_PATH)await run(process.env.HEIF_CONVERT_PATH,[original,fallback],{timeout:60000,maxBuffer:1024*1024});
   else throw e;
   source=fallback;try{await sharp(source,{limitInputPixels:100000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).withIccProfile('srgb').jpeg({quality:88}).toFile(preview);}finally{await rm(fallback,{force:true});}
  }
  const info=await sharp(preview).metadata();return {previewKey,playbackKey:null,capturedText,capturedZone,metadata:{width:info.width,height:info.height,previewColor:'sRGB'}};
 }
 const probe=JSON.parse((await run(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',original],{timeout:30000,maxBuffer:4*1024*1024})).stdout);
 const video=probe.streams?.find((s:{codec_type:string})=>s.codec_type==='video');if(!video)throw Error('VIDEO_TRACK_MISSING');
 const tags=probe.format?.tags||{},raw=tags['com.apple.quicktime.creationdate']||tags.creation_time||video.tags?.creation_time;
 if(typeof raw==='string'&&!raw.startsWith('1904-')&&!raw.startsWith('0000-')){capturedText=raw;capturedZone=/Z$/.test(raw)?'UTC':raw.match(/[+-]\d\d:?\d\d$/)?.[0]||null;}
 const hdr=['smpte2084','arib-std-b67'].includes(video.color_transfer);
 const scale="scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
 const filter=(hdr?'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,':'')+scale+',format=yuv420p';
 const playbackKey=base+'.mp4',playback=objectPath(playbackKey);
 await run(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-i',original,'-map','0:v:0','-map','0:a:0?','-vf',filter,'-c:v','libx264','-preset','fast','-crf','23','-threads','2','-c:a','aac','-b:a','128k','-movflags','+faststart','-map_metadata','-1',playback],{timeout:20*60*1000,maxBuffer:4*1024*1024});
 await run(process.env.FFMPEG_PATH||'ffmpeg',['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-i',playback,'-frames:v','1','-q:v','2',preview],{timeout:30000,maxBuffer:1024*1024});
 return {previewKey,playbackKey,capturedText,capturedZone,metadata:{width:video.width,height:video.height,sourceCodec:video.codec_name,duration:Number(probe.format?.duration)||null,hdrSource:hdr,playbackColor:'SDR',rotation:video.side_data_list?.find((d:{rotation?:number})=>d.rotation!==undefined)?.rotation||0}};
 }catch(error){
  await Promise.all([preview,objectPath(base+'.mp4'),preview+'.converted.png'].map(path=>rm(path,{force:true}).catch(()=>{})));
  throw error;
 }
}

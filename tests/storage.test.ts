import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID,createHash } from 'node:crypto';
import { once } from 'node:events';
import sharp from 'sharp';
import { storageServer } from '../src/server/storage/http-server';
import { signTicket,objectPath,originalEvidence } from '../src/server/storage/local';
import { readCapture } from '../src/server/storage/capture';
import { processMedia } from '../workers/process-media';
let root:string,base:string;const server=storageServer();
const origin='http://localhost:3000';
const key=()=>`originals/${randomUUID()}/${randomUUID()}.bin`;
const ticket=(key:string,operation:'get'|'put',size=0)=>`${base}/object?ticket=${signTicket({key,operation,expires:Date.now()+60000,size,kind:'image',mime:'image/png'})}`;
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'momentnest-storage-'));process.env.MEDIA_ROOT=root;process.env.MEDIA_SIGNING_SECRET='test-only-signing-secret-'+randomUUID();process.env.APP_URL=origin;server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await rm(root,{recursive:true,force:true});});
describe('real local immutable storage and processing',()=>{
 it('流式上传保留原字节，签名GET与Range读取、禁止覆盖',async()=>{const data=await sharp({create:{width:16,height:12,channels:3,background:'#78aa55'}}).png().toBuffer();const k=key(),url=ticket(k,'put',data.length);expect((await fetch(url,{method:'PUT',headers:{Origin:origin},body:data})).status).toBe(201);expect(await readFile(objectPath(k))).toEqual(data);expect((await originalEvidence(k)).sha256).toBe(createHash('sha256').update(data).digest('hex'));expect((await fetch(url,{method:'PUT',headers:{Origin:origin},body:data})).status).toBe(409);const get=ticket(k,'get');const r=await fetch(get,{headers:{Range:'bytes=0-7'}});expect(r.status).toBe(206);expect(Buffer.from(await r.arrayBuffer())).toEqual(data.subarray(0,8));expect((await fetch(get,{headers:{Range:'bytes=999999-'}})).status).toBe(416);});
 it('拒绝过期、篡改、跨来源与伪造格式，临时失败不保存原件',async()=>{const k=key();expect((await fetch(base+'/object?ticket='+signTicket({key:k,operation:'get',expires:Date.now()-1}))).status).toBe(400);expect((await fetch(ticket(k,'get')+'x')).status).toBe(400);expect((await fetch(ticket(k,'put',3),{method:'PUT',headers:{Origin:'https://evil.invalid'},body:'bad'})).status).toBe(400);expect((await fetch(ticket(k,'put',3),{method:'PUT',headers:{Origin:origin},body:'bad'})).status).toBe(400);await expect(readFile(objectPath(k))).rejects.toThrow();});
 it('上传校验阶段读取照片 EXIF 日期和时区，不依赖 worker',async()=>{
  const fixture=join(root,'dated.jpg');await sharp({create:{width:16,height:12,channels:3,background:'#78aa55'}}).withExif({IFD2:{DateTimeOriginal:'2025:06:01 23:30:00',OffsetTimeOriginal:'-04:00'}}).jpeg().toFile(fixture);
  expect(await readCapture(fixture,'image')).toMatchObject({capturedText:'2025:06:01 23:30:00',capturedZone:'-04:00',capturedOn:'2025-06-02'});
 });
 it('真实照片生成预览，未知拍摄时间不被上传时间替代，原件哈希不变',async()=>{const data=await sharp({create:{width:60,height:40,channels:3,background:'#557744'}}).png().toBuffer(),k=key();await fetch(ticket(k,'put',data.length),{method:'PUT',headers:{Origin:origin},body:data});const sha=createHash('sha256').update(data).digest('hex');const result=await processMedia({mediaId:randomUUID(),token:randomUUID(),generation:1,attempts:1,key:k,kind:'image',sha256:sha});expect(result.capturedText).toBeNull();expect((await sharp(objectPath(result.previewKey)).metadata()).format).toBe('jpeg');expect(createHash('sha256').update(await readFile(objectPath(k))).digest('hex')).toBe(sha);});
 it('本机HEIC解码生成JPEG预览且不改原件',async()=>{
  const input=join(root,'source.png'),output=join(root,'source.heic');await sharp({create:{width:60,height:40,channels:3,background:'#557744'}}).png().toFile(input);
  if(process.platform==='darwin')await promisify(execFile)('sips',['-s','format','heic',input,'--out',output],{timeout:30000});
  else{
   process.env.HEIF_CONVERT_PATH='/usr/bin/heif-convert';
   await promisify(execFile)('heif-enc',['-q','50','-o',output,input],{timeout:30000});
  }
  const data=await readFile(output),k=key();expect((await fetch(ticket(k,'put',data.length),{method:'PUT',headers:{Origin:origin},body:data})).status).toBe(201);
  const result=await processMedia({mediaId:randomUUID(),token:randomUUID(),generation:1,attempts:1,key:k,kind:'image',sha256:createHash('sha256').update(data).digest('hex')});
  expect((await sharp(objectPath(result.previewKey)).metadata()).format).toBe('jpeg');expect(await readFile(objectPath(k))).toEqual(data);
 },60000);
 it('HEVC/HDR MOV转成H264播放版及封面，保留原件与拍摄时间',async()=>{
  const fixture=join(root,'fixture.mov');await promisify(execFile)('ffmpeg',['-nostdin','-y','-v','error','-f','lavfi','-i','testsrc2=size=64x48:rate=10','-t','0.4','-c:v','libx265','-x265-params','pools=1:frame-threads=1:log-level=error:transfer=smpte2084:colorprim=bt2020:colormatrix=bt2020nc','-pix_fmt','yuv420p10le','-tag:v','hvc1','-color_trc','smpte2084','-colorspace','bt2020nc','-color_primaries','bt2020','-metadata','creation_time=2025-06-01T08:30:00Z',fixture],{timeout:30000});
  expect(await readCapture(fixture,'video')).toMatchObject({capturedOn:'2025-06-01',capturedZone:'UTC'});
  const data=await readFile(fixture),k=key();const url=base+'/object?ticket='+signTicket({key:k,operation:'put',expires:Date.now()+60000,size:data.length,kind:'video'});expect((await fetch(url,{method:'PUT',headers:{Origin:origin},body:data})).status).toBe(201);
  const sha=createHash('sha256').update(data).digest('hex'),result=await processMedia({mediaId:randomUUID(),token:randomUUID(),generation:1,attempts:1,key:k,kind:'video',sha256:sha});
  expect(result.metadata.hdrSource).toBe(true);expect(result.capturedText).toContain('2025-06-01');expect(result.capturedZone).toBe('UTC');
  const probe=JSON.parse((await promisify(execFile)('ffprobe',['-v','error','-show_streams','-of','json',objectPath(result.playbackKey!)])).stdout);expect(probe.streams[0].codec_name).toBe('h264');expect((await sharp(objectPath(result.previewKey)).metadata()).format).toBe('jpeg');expect(await readFile(objectPath(k))).toEqual(data);
 },60000);

});

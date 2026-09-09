import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {once} from 'node:events';
import {storageServer} from '../src/server/storage/http-server';
import {signTicket,objectPath,originalEvidence} from '../src/server/storage/local';
import {UPLOAD_CHUNK_SIZE as chunk} from '../src/domain/upload-progress';
let root:string,base:string;const server=storageServer(),origin='http://localhost:3000';
const data=Buffer.alloc(chunk*2+100,7);data.set([137,80,78,71,13,10,26,10]);
const makeKey=()=>`originals/${randomUUID()}/${randomUUID()}.bin`;
const url=(key:string,operation:'get'|'put'='put',expires=Date.now()+60000)=>`${base}/object?ticket=${signTicket({key,operation,expires,size:data.length,kind:'image'})}`;
// Same-origin browser HEAD requests omit Origin, unlike upload PUT/POST requests.
const head=(u:string)=>fetch(u,{method:'HEAD'});
const put=(u:string,start:number,body=data.subarray(start,Math.min(start+chunk,data.length)))=>fetch(u,{method:'PUT',headers:{Origin:origin,'Content-Range':`bytes ${start}-${start+body.length-1}/${data.length}`},body});
beforeAll(async()=>{root=await mkdtemp(join(tmpdir(),'nest-resume-'));process.env.MEDIA_ROOT=root;process.env.APP_URL=origin;process.env.MEDIA_SIGNING_SECRET='test-only-'+randomUUID()+randomUUID();server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});});
describe('resumable private originals over HTTP',()=>{
 it('retains committed chunks across a new server instance, validates and publishes byte-identical originals',async()=>{
  const key=makeKey(),u=url(key);expect((await head(u)).headers.get('Upload-Offset')).toBe('0');
  expect((await put(u,0)).status).toBe(204);
  await expect(readFile(objectPath(key))).rejects.toThrow();expect((await fetch(url(key,'get'))).status).toBe(400);
  // An unfinished chunk left by a crashed process must never count as uploaded.
  await writeFile(objectPath(key)+'.parts/crashed.part','partial');
  const fresh=storageServer();fresh.listen(0,'127.0.0.1');await once(fresh,'listening');
  try{const resumed=u.replace(base,`http://127.0.0.1:${(fresh.address() as {port:number}).port}`);
   expect((await head(resumed)).headers.get('Upload-Offset')).toBe(String(chunk));
   expect((await put(resumed,chunk)).status).toBe(204);
   expect((await put(resumed,chunk*2)).status).toBe(201);
  }finally{fresh.closeAllConnections();await new Promise<void>(resolve=>fresh.close(()=>resolve()));}
  expect((await readFile(objectPath(key))).equals(data)).toBe(true);
  expect((await originalEvidence(key)).sha256).toBe(createHash('sha256').update(data).digest('hex'));
  expect((await head(u)).headers.get('Upload-Complete')).toBe('1');
  expect((await put(u,0)).status).toBe(409);expect((await readFile(objectPath(key))).equals(data)).toBe(true);
 });
 it('rejects out-of-order, wrong-sized, repeated and forged chunks without advancing',async()=>{
  const key=makeKey(),u=url(key);
  expect((await put(u,chunk)).status).toBe(409);
  expect((await put(u,0,Buffer.from('bad'))).status).toBe(400);
  expect((await put(u,0,Buffer.alloc(chunk))).status).toBe(400);
  expect((await head(u)).headers.get('Upload-Offset')).toBe('0');
  expect((await put(u,0)).status).toBe(204);expect((await put(u,0)).status).toBe(409);
  expect((await head(u)).headers.get('Upload-Offset')).toBe(String(chunk));
 });
 it('can finish assembly after all chunks arrived but the final response was lost',async()=>{
  const key=makeKey(),path=objectPath(key),u=url(key);await mkdir(path+'.parts',{recursive:true});
  for(let start=0;start<data.length;start+=chunk)await writeFile(path+'.parts/'+start,data.subarray(start,Math.min(start+chunk,data.length)));
  const status=await head(u);expect(status.headers.get('Upload-Offset')).toBe(String(data.length));expect(status.headers.get('Upload-Complete')).toBe('0');
  expect((await fetch(u,{method:'POST',headers:{Origin:origin},body:''})).status).toBe(201);
  expect((await readFile(path)).equals(data)).toBe(true);
 });
 it('allows signed progress queries without Origin and still exposes offsets with an allowed Origin',async()=>{
  const u=url(makeKey());
  const cases:Record<string,string>[]=[{},{Origin:origin}];
  for(const headers of cases){
   const response=await fetch(u,{method:'HEAD',headers});
   expect(response.status).toBe(200);expect(response.headers.get('Upload-Offset')).toBe('0');
   expect(response.headers.get('Upload-Complete')).toBe('0');
  }
 });
 it('requires signed upload permission and rejects untrusted explicit origins',async()=>{
  const key=makeKey();expect((await head(url(key,'put',Date.now()-1))).status).toBe(400);
  expect((await head(`${base}/object?ticket=invalid`)).status).toBe(400);
  expect((await head(url(key,'get'))).status).toBe(403);
  expect((await fetch(url(key),{method:'HEAD',headers:{Origin:'https://evil.invalid'}})).status).toBe(400);
  expect((await fetch(url(key),{method:'HEAD',headers:{Origin:'null'}})).status).toBe(400);
  expect((await fetch(url(key),{method:'POST',headers:{Origin:origin},body:''})).status).toBe(400);
  const preflight=await fetch(url(key),{method:'OPTIONS',headers:{Origin:origin}});
  expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Content-Range');
  expect(preflight.headers.get('Access-Control-Expose-Headers')).toContain('Upload-Offset');
 });
 it('still requires an allowed Origin for writes and preflight requests',async()=>{
  const key=makeKey(),u=url(key),path=objectPath(key);
  // Complete staged chunks make finalization possible, so a rejection proves the origin check runs.
  await mkdir(path+'.parts',{recursive:true});
  for(let start=0;start<data.length;start+=chunk)await writeFile(path+'.parts/'+start,data.subarray(start,Math.min(start+chunk,data.length)));
  const cases:Record<string,string>[]=[{},{Origin:'https://evil.invalid'}];
  for(const headers of cases){
   expect((await fetch(u,{method:'POST',headers,body:''})).status).toBe(400);
   expect((await fetch(u,{method:'PUT',headers,body:data})).status).toBe(400);
   expect((await fetch(u,{method:'PUT',headers:{...headers,'Content-Range':`bytes 0-${chunk-1}/${data.length}`},body:data.subarray(0,chunk)})).status).toBe(400);
   expect((await fetch(u,{method:'OPTIONS',headers})).status).toBe(403);
  }
  await expect(readFile(path)).rejects.toThrow();
 });
});

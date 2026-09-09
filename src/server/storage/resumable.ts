import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,stat,rm,link,open,writeFile} from 'node:fs/promises';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {detectMime,type StorageTicket} from './local';
import {UPLOAD_CHUNK_SIZE} from '../../domain/upload-progress';

const partPath=(path:string,offset:number)=>`${path}.parts/${offset}`;
// Only atomically committed chunks contribute to the resumable offset.
export async function resumeState(path:string,total:number){
 try{const s=await stat(path);if(s.size!==total)throw Error('WRONG_SIZE');return {offset:total,complete:true};}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 let offset=0;
 while(offset<total){
  try{const s=await stat(partPath(path,offset));if(s.size!==Math.min(UPLOAD_CHUNK_SIZE,total-offset))throw Error('INVALID_CHUNK');offset+=s.size;}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')break;throw e;}
 }
 return {offset,complete:false};
}
export function chunkRange(value:string,total:number,length:number){
 const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
 if(!m)throw Error('INVALID_RANGE');
 const start=Number(m[1]),end=Number(m[2]);
 if(!Number.isSafeInteger(start)||start%UPLOAD_CHUNK_SIZE||Number(m[3])!==total||end!==Math.min(start+UPLOAD_CHUNK_SIZE,total)-1||length!==end-start+1||start>=total)throw Error('INVALID_RANGE');
 return {start,end};
}
export async function receiveChunk(req:IncomingMessage,path:string,t:StorageTicket,start:number,end:number){
 await mkdir(path+'.parts',{recursive:true,mode:0o700});
 const temp=`${path}.parts/${randomUUID()}.part`;let received=0;
 try{
  await pipeline(req,new Transform({transform(chunk:Buffer,_encoding,cb){received+=chunk.length;if(received>end-start+1||Date.now()>t.expires){cb(Error('UPLOAD_LIMIT'));return;}cb(null,chunk);}}),createWriteStream(temp,{flags:'wx',mode:0o600}));
  if(received!==end-start+1)throw Error('WRONG_SIZE');
  // Check the first chunk before retaining any bytes as a resumable upload.
  if(start===0){const fd=await open(temp,'r');const head=Buffer.alloc(64);try{await fd.read(head,0,64,0);}finally{await fd.close();}if(detectMime(head)?.kind!==t.kind)throw Error('UNSUPPORTED_CONTENT');}
  await link(temp,partPath(path,start));
 }finally{await rm(temp,{force:true});}
}
export async function finalizeChunks(path:string,t:StorageTicket){
 const state=await resumeState(path,t.size!);if(state.complete)return;
 if(state.offset!==t.size)throw Error('INCOMPLETE_UPLOAD');
 const temp=path+'.'+randomUUID()+'.part';let size=0;let head=Buffer.alloc(0);const hash=createHash('sha256');
 async function* chunks(){for(let offset=0;offset<t.size!;offset+=UPLOAD_CHUNK_SIZE)yield* createReadStream(partPath(path,offset));}
 try{
  await pipeline(Readable.from(chunks()),new Transform({transform(chunk:Buffer,_enc,cb){size+=chunk.length;if(size>t.size!){cb(Error('WRONG_SIZE'));return;}if(head.length<64)head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);hash.update(chunk);cb(null,chunk);}}),createWriteStream(temp,{flags:'wx',mode:0o600}));
  const content=detectMime(head);if(size!==t.size||content?.kind!==t.kind)throw Error('UNSUPPORTED_CONTENT');
  await link(temp,path);
  await writeFile(path+'.json',JSON.stringify({size,sha256:hash.digest('hex'),...content}),{flag:'wx',mode:0o600});
  await rm(path+'.parts',{recursive:true,force:true});
 }finally{await rm(temp,{force:true});}
}

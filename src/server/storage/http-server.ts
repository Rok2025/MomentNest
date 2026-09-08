import { createServer } from 'node:http';
import { createReadStream,createWriteStream } from 'node:fs';
import { mkdir,rm,link,writeFile,stat,statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash,randomUUID } from 'node:crypto';
import { verifyTicket,objectPath,detectMime,storageRoot } from './local';
export function storageServer(){
 const active=new Set<string>();let inFlight=0;
 const server=createServer(async(req,res)=>{
  const allowed=process.env.APP_URL||'http://localhost:3000';
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin===allowed){res.setHeader('Access-Control-Allow-Origin',allowed);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','Content-Range,Content-Length,Accept-Ranges');}
  if(req.method==='OPTIONS'){if(req.headers.origin!==allowed){res.writeHead(403).end();return;}res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Range');res.writeHead(204).end();return;}
  let temp:string|undefined,key:string|undefined;
  try{
   const url=new URL(req.url||'/',allowed);
   if(url.pathname==='/health'&&req.method==='GET'){
    await stat(storageRoot());res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');return;
   }
   if(url.pathname!=='/object')throw Error('NOT_FOUND');
   const t=verifyTicket(url.searchParams.get('ticket')||''),path=objectPath(t.key);
   if(req.method==='PUT'&&t.operation==='put'){
    if(req.headers.origin!==allowed)throw Error('FORBIDDEN');
    if(!t.size||t.size>524288000||t.size<=0||Number(req.headers['content-length'])!==t.size)throw Error('WRONG_SIZE');
    if(active.has(t.key)||inFlight>=3){res.writeHead(409).end();return;}key=t.key;active.add(key);inFlight++;
    await mkdir(dirname(path),{recursive:true,mode:0o700});const disk=await statfs(storageRoot());if(disk.bavail*disk.bsize<t.size+1073741824)throw Error('DISK_FULL');
    try{await stat(path);res.writeHead(409).end();return;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    temp=path+'.'+randomUUID()+'.part';let size=0;let head=Buffer.alloc(0);const hash=createHash('sha256');
    const inspect=new Transform({transform(chunk:Buffer,_enc,cb){size+=chunk.length;if(size>t.size!||Date.now()>t.expires){cb(Error('UPLOAD_LIMIT'));return;}if(head.length<64)head=Buffer.concat([head,chunk.subarray(0,64-head.length)]);hash.update(chunk);cb(null,chunk);}});
    await pipeline(req,inspect,createWriteStream(temp,{flags:'wx',mode:0o600}));
    const content=detectMime(head);if(size!==t.size||content?.kind!==t.kind)throw Error('UNSUPPORTED_CONTENT');
    // Hard-link is atomic and refuses overwrite. Old signed upload URLs cannot replace originals.
    await link(temp,path);await writeFile(path+'.json',JSON.stringify({size,sha256:hash.digest('hex'),...content}),{flag:'wx',mode:0o600});
    res.writeHead(201,{'Content-Type':'application/json'}).end('{"ok":true}');
   }else if(req.method==='GET'&&t.operation==='get'){
    const info=await stat(path);let start=0,end=info.size-1,status=200;const range=req.headers.range;
    if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
     if(!m[1])start=Math.max(0,info.size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}
     if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
    }
    res.setHeader('Content-Type',t.mime||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);
    if(t.download)res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(t.download)}`);
    res.writeHead(status);await pipeline(createReadStream(path,{start,end}),res);
   }else{res.writeHead(403).end();}
  }catch{if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'}).end('{"ok":false,"message":"文件请求无效、已过期或暂不可用"}');else res.destroy();}
  finally{if(temp)await rm(temp,{force:true}).catch(()=>{});if(key){active.delete(key);inFlight--;}}
 });
 server.requestTimeout=15*60*1000;
 server.headersTimeout=60000;
 return server;
}

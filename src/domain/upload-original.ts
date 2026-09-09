import {RESUMABLE_THRESHOLD,UPLOAD_CHUNK_SIZE} from './upload-progress';
export type UploadAuth={id:string;url:string;expires:number;verified:boolean};
type Options={signal:AbortSignal;progress:(bytes:number)=>void;refresh:()=>Promise<UploadAuth>};
function checkAbort(signal:AbortSignal){if(signal.aborted)throw new DOMException('上传已取消','AbortError');}
function send(url:string,method:string,body:Blob,signal:AbortSignal,progress:(bytes:number)=>void,range?:string){
 return new Promise<number>((resolve,reject)=>{
  checkAbort(signal);const xhr=new XMLHttpRequest();
  const abort=()=>xhr.abort();
  const finish=(error?:Error)=>{signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(xhr.status);};
  xhr.open(method,url);xhr.timeout=15*60*1000;xhr.setRequestHeader('Content-Type','application/octet-stream');
  if(range)xhr.setRequestHeader('Content-Range',range);
  xhr.upload.onprogress=e=>{if(e.lengthComputable)progress(e.loaded);};
  xhr.onload=()=>finish();xhr.onerror=()=>finish(Error('网络中断，请重试继续上传'));
  xhr.ontimeout=()=>finish(Error('上传超时，请重试继续上传'));xhr.onabort=()=>finish(new DOMException('上传已取消','AbortError'));
  signal.addEventListener('abort',abort,{once:true});xhr.send(body);
 });
}
export async function uploadOriginal(file:File,initial:UploadAuth,options:Options){
 let auth=initial;
 async function ticket(){checkAbort(options.signal);if(auth.expires<=Date.now()+60000)auth=await options.refresh();checkAbort(options.signal);return auth.url;}
 async function state(){
  const r=await fetch(await ticket(),{method:'HEAD',signal:options.signal,cache:'no-store'});
  if(!r.ok)throw Error('暂时无法确认上传进度，请重试');
  const raw=r.headers.get('Upload-Offset'),offset=Number(raw);
  if(raw===null||!Number.isSafeInteger(offset)||offset<0||offset>file.size||(offset!==file.size&&offset%UPLOAD_CHUNK_SIZE))throw Error('上传进度无效，请稍后重试');
  return {offset,complete:r.headers.get('Upload-Complete')==='1'};
 }
 if(auth.verified){options.progress(file.size);return;}
 if(file.size<RESUMABLE_THRESHOLD){
  const status=await send(await ticket(),'PUT',file,options.signal,options.progress);
  if(status!==201&&!(status===409&&(await state()).complete))throw Error('原件上传未完成，请重试');
  options.progress(file.size);return;
 }
 let {offset,complete}=await state();options.progress(offset);
 if(complete)return;
 while(offset<file.size){
  const end=Math.min(offset+UPLOAD_CHUNK_SIZE,file.size);
  try{
   const status=await send(await ticket(),'PUT',file.slice(offset,end),options.signal,bytes=>options.progress(offset+bytes),`bytes ${offset}-${end-1}/${file.size}`);
   if(status!==204&&status!==201)throw Error('分片尚未确认，请重试继续上传');
   offset=end;complete=status===201;options.progress(offset);
  }catch(e){options.progress(offset);throw e;}
 }
 if(!complete){
  const status=await send(await ticket(),'POST',new Blob([]),options.signal,()=>{});
  if(status!==201&&!(status===409&&(await state()).complete))throw Error('原件正在合并，请重试确认');
 }
}

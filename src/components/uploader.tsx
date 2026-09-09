'use client';
import Image from 'next/image';
import { DateField } from './date-field';
import { useRef,useEffect,useState } from 'react';
import { UploadQueue } from '@/domain/upload-queue';
import { fileProblem,MAX_FILES } from '@/domain/media';
import { BIRTHDAY,validEventDate } from '@/domain/dates';
type UploadAuth={id:string;url:string;expires:number;verified:boolean};
export type UploadItem={key:string;file:File;id?:string;status:'preparing'|'waiting'|'uploading'|'verifying'|'verified'|'failed';progress:number;error?:string;preview?:string;occurredOn?:string;capturedOn?:string|null;capturedText?:string|null;dateEdited?:boolean};
export function Uploader({items,onChange,disabled,existing=0,onExpired,date,today}:{items:UploadItem[];onChange:(items:UploadItem[])=>void;disabled:boolean;existing?:number;onExpired:()=>void;date:string;today:string}){
 const current=useRef(items);const requests=useRef(new Map<string,XMLHttpRequest>());const previews=useRef(new Set<string>());const mounted=useRef(true);const [queue]=useState(()=>new UploadQueue(2));
 useEffect(()=>{mounted.current=true;const active=requests.current,urls=previews.current;return()=>{mounted.current=false;queue.clear();active.forEach(x=>x.abort());urls.forEach(u=>URL.revokeObjectURL(u));};},[queue]);
 function present(key:string){return mounted.current&&current.current.some(i=>i.key===key);}
 function patch(key:string,values:Partial<UploadItem>){if(!present(key))return;const next=current.current.map(i=>i.key===key?{...i,...values}:i);current.current=next;onChange(next);}
 async function post(path:string,body:unknown){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const data=await r.json();if(r.status===401&&mounted.current)onExpired();if(!r.ok)throw Error(data.message||'上传失败，请重试');return data;}
 function cancel(id:string){void post('/api/uploads/cancel',{id}).catch(()=>{});}
 async function upload(item:UploadItem,prepared?:UploadAuth){
  if(!present(item.key))return;
  try{
   patch(item.key,{status:prepared?'waiting':'preparing',error:undefined,progress:0});
   const reuse=prepared&&prepared.expires>Date.now()+60000;
   const id=prepared?.id||item.id;
   const auth:UploadAuth=reuse?prepared:await post('/api/uploads/authorize',{name:item.file.name,size:item.file.size,...(id?{id}:{})});
   if(!present(item.key)){cancel(auth.id);return;}
   patch(item.key,{id:auth.id});
   if(!auth.verified){
    patch(item.key,{status:'uploading'});
    await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();requests.current.set(item.key,xhr);xhr.open('PUT',auth.url);xhr.timeout=15*60*1000;xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.upload.onprogress=e=>patch(item.key,{progress:e.lengthComputable?Math.round(e.loaded/e.total*100):0});xhr.onload=()=>xhr.status===201||xhr.status===409?resolve():reject(Error('原件上传失败，请重试'));xhr.onerror=()=>reject(Error('网络中断或媒体服务不可用，请重试'));xhr.ontimeout=()=>reject(Error('上传超时，请重试'));xhr.onabort=()=>reject(Error('上传已取消'));xhr.send(item.file);});
    patch(item.key,{status:'verifying',progress:100});
   }
   if(!present(item.key))return;
   const result=await post('/api/uploads/complete',{id:auth.id});
   const latest=current.current.find(i=>i.key===item.key);
   patch(item.key,{status:'verified',progress:100,capturedOn:result.capturedOn,capturedText:result.capturedText,...(!latest?.dateEdited?{occurredOn:result.capturedOn||undefined}:{})});
  }catch(e){patch(item.key,{status:'failed',error:(e as Error).message});}finally{requests.current.delete(item.key);}
 }
 async function prepare(added:UploadItem[]){
  const valid=added.filter(item=>!item.error);if(!valid.length)return;
  try{
   const result=await post('/api/uploads/authorize',{files:valid.map(item=>({name:item.file.name,size:item.file.size}))}) as {uploads:UploadAuth[]};
   for(const [index,item] of valid.entries()){
    const auth=result.uploads[index];
    if(!present(item.key)){cancel(auth.id);continue;}
    patch(item.key,{id:auth.id,status:'waiting'});
    queue.add(item.key,()=>upload(item,auth));
   }
  }catch(e){for(const item of valid)patch(item.key,{status:'failed',error:(e as Error).message});}
 }
 function retry(item:UploadItem){patch(item.key,{status:'waiting',error:undefined,progress:0});queue.add(item.key,()=>upload(item));}
 function add(files:File[]){const added=files.map(file=>{const problem=fileProblem(file.name,file.size);const preview=!problem&&/^image\/(jpeg|png|webp)$/.test(file.type)?URL.createObjectURL(file):undefined;if(preview)previews.current.add(preview);return {key:crypto.randomUUID(),file,status:problem?'failed':'preparing',progress:0,error:problem,preview} as UploadItem;});const next=[...current.current,...added];current.current=next;onChange(next);void prepare(added);}
 function remove(item:UploadItem){queue.remove(item.key);requests.current.get(item.key)?.abort();if(item.preview){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}const next=current.current.filter(i=>i.key!==item.key);current.current=next;onChange(next);if(item.id)cancel(item.id);}
 return <section className="upload-box"><label className="upload-picker">＋ 添加照片 / 视频<input className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mov,.mp4,.m4v" disabled={disabled||existing+items.length>=MAX_FILES} onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length+items.length+existing>MAX_FILES){e.target.setCustomValidity('每条最多20份素材，请减少选择');e.target.reportValidity();}else{e.target.setCustomValidity('');add(files);}e.target.value='';}}/></label><details className="upload-help"><summary>格式和大小说明</summary><p className="muted">每次最多20份 · 照片50 MB / 视频500 MB · 原件私密保存。Live Photo 请分别选择照片和视频。</p></details>
 <ul className="upload-list">{items.map(item=><li key={item.key}>{item.preview&&<Image unoptimized width={1920} height={1280} src={item.preview} alt="所选照片预览" decoding="async"/>}<div className="upload-info"><strong>{item.file.name}</strong><small>{(item.file.size/1024/1024).toFixed(1)} MB · {item.status==='verified'?'原件已验证':item.status==='verifying'?'正在验证原件':item.status==='preparing'?'正在准备上传…':item.status==='waiting'?'排队上传':item.status==='uploading'?`正在上传 ${item.progress}%`:item.error}</small>{item.status==='verified'&&<label className="media-date"><span>{item.capturedOn||item.dateEdited?'拍摄日期':'确认日期'}</span><DateField label={`${item.file.name}的日期`} min={BIRTHDAY} max={today} required disabled={disabled} value={item.occurredOn??date} onChange={value=>patch(item.key,{occurredOn:value,dateEdited:true})}/>{!validEventDate(item.occurredOn??date,today)&&<small role="alert">请选择出生日至今天之间的日期</small>}</label>}{['uploading','verifying'].includes(item.status)&&<progress max={100} value={item.progress}/>}</div>{item.status==='failed'&&!fileProblem(item.file.name,item.file.size)&&<button type="button" disabled={disabled} onClick={()=>retry(item)}>重试</button>}<button type="button" disabled={disabled} onClick={()=>remove(item)}>{item.status==='uploading'?'取消':'移除'}</button></li>)}</ul></section>;
}

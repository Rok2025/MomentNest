'use client';
import Image from 'next/image';
import { DateField } from './date-field';
import { useRef,useEffect,useState } from 'react';
import { uploadOriginal,type UploadAuth } from '@/domain/upload-original';
import {uploadProgress,formatUploadBytes,RESUMABLE_THRESHOLD} from '@/domain/upload-progress';
import { UploadQueue } from '@/domain/upload-queue';
import { fileProblem,MAX_FILES } from '@/domain/media';
import { BIRTHDAY,validEventDate } from '@/domain/dates';
import { uploadDateReady } from '@/domain/upload-date';
export type UploadItem={key:string;file:File;id?:string;status:'preparing'|'waiting'|'uploading'|'verifying'|'verified'|'failed';progress:number;uploadedBytes?:number;error?:string;preview?:string;occurredOn?:string;capturedOn?:string|null;capturedText?:string|null;dateEdited?:boolean};
export function Uploader({items,onChange,disabled,existing=0,onExpired,date,today}:{items:UploadItem[];onChange:(items:UploadItem[])=>void;disabled:boolean;existing?:number;onExpired:()=>void;date:string;today:string}){
 const details=useRef<HTMLDetailsElement>(null);
 const current=useRef(items);const requests=useRef(new Map<string,AbortController>());const previews=useRef(new Set<string>());const mounted=useRef(true);const [queue]=useState(()=>new UploadQueue(2));
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
    const controller=new AbortController();requests.current.set(item.key,controller);
    await uploadOriginal(item.file,auth,{signal:controller.signal,
     progress:bytes=>patch(item.key,{uploadedBytes:bytes,progress:Math.floor(bytes/item.file.size*100)}),
     refresh:()=>post('/api/uploads/authorize',{id:auth.id,name:item.file.name,size:item.file.size}),
    });
    patch(item.key,{status:'verifying',progress:100});
   }
   if(!present(item.key))return;
   const result=await post('/api/uploads/complete',{id:auth.id});
   const latest=current.current.find(i=>i.key===item.key);
   patch(item.key,{status:'verified',progress:100,capturedOn:result.capturedOn,capturedText:result.capturedText,...(!latest?.dateEdited?{occurredOn:result.capturedOn||''}:{})});
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
    queue.add(item.key,()=>upload(item,auth),item.file.size);
   }
  }catch(e){for(const item of valid)patch(item.key,{status:'failed',error:(e as Error).message});}
 }
 function retry(item:UploadItem){patch(item.key,{status:'waiting',error:undefined,progress:0});queue.add(item.key,()=>upload(item),item.file.size);}
 function add(files:File[]){const added=files.map(file=>{const problem=fileProblem(file.name,file.size);const preview=!problem&&/^image\/(jpeg|png|webp)$/.test(file.type)?URL.createObjectURL(file):undefined;if(preview)previews.current.add(preview);return {key:crypto.randomUUID(),file,status:problem?'failed':'preparing',progress:0,error:problem,preview} as UploadItem;});const next=[...current.current,...added];current.current=next;onChange(next);void prepare(added);}
 function remove(item:UploadItem){queue.remove(item.key);requests.current.get(item.key)?.abort();if(item.preview){URL.revokeObjectURL(item.preview);previews.current.delete(item.preview);}const next=current.current.filter(i=>i.key!==item.key);current.current=next;onChange(next);if(item.id)cancel(item.id);}
 const summary=uploadProgress(items);
 const pendingDates=items.filter(item=>item.status==='verified'&&!uploadDateReady(item,today));
 const unknownDates=pendingDates.filter(item=>!item.capturedOn&&!item.dateEdited).length;
 function confirmDates(){
  if(!details.current)return;
  details.current.open=true;
  requestAnimationFrame(()=>{
   const field=details.current?.querySelector<HTMLInputElement>('[data-date-pending] input[type=date]');
   field?.focus({preventScroll:true});
   field?.closest('li')?.scrollIntoView({block:'nearest'});
  });
 }
 return <section className="upload-box"><label className="upload-picker">＋ 添加照片 / 视频<input className="sr-only" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mov,.mp4,.m4v" disabled={disabled||existing+items.length>=MAX_FILES} onChange={e=>{const files=Array.from(e.target.files||[]);if(files.length+items.length+existing>MAX_FILES){e.target.setCustomValidity(`每条最多${MAX_FILES}份素材，请减少选择`);e.target.reportValidity();}else{e.target.setCustomValidity('');add(files);}e.target.value='';}}/></label><details className="upload-help"><summary>格式和大小说明</summary><p className="muted">每条最多{MAX_FILES}份 · 照片50 MB / 视频500 MB · 原件私密保存。Live Photo 请分别选择照片和视频。</p></details>
 {items.length>0&&<div className="upload-summary" aria-label="整体上传进度">
  <div><strong role="status">已完成 {summary.completed}/{summary.count}</strong><span>{summary.percent}%</span></div>
  <progress aria-label="文件传输总进度" max={100} value={summary.percent}/>
  <p>{summary.completed===summary.count?'全部上传完成':summary.remaining>0?`剩余上传 ${formatUploadBytes(summary.remaining)}`:'传输完成，正在校验原件'}{summary.failed>0?` · ${summary.failed} 份失败，请重试或移除`:''}</p>
  {items.some(i=>i.file.size>=RESUMABLE_THRESHOLD)&&summary.completed!==summary.count&&<small>大文件支持本页内重试续传，请保持页面打开。</small>}
 </div>}
 {pendingDates.length>0&&<div className="upload-date-notice"><p className="upload-attention" role="status">{unknownDates>0?`${unknownDates} 份素材拍摄日期未知，必须确认后保存。`:"请确认素材日期后保存。"}{pendingDates.length>unknownDates&&unknownDates>0?`另有 ${pendingDates.length-unknownDates} 份日期需要修改。`:""}</p><button type="button" disabled={disabled} onClick={confirmDates}>去确认日期</button></div>}
 {items.length>0&&<details ref={details} className="upload-details" onInvalidCapture={event=>{event.currentTarget.open=true;}}>
  <summary><span>文件上传详情 · {items.length} 份</span><span className="upload-details-expand">展开</span><span className="upload-details-collapse">收起</span></summary>
 <ul className="upload-list">{items.map(item=><li key={item.key} data-date-pending={item.status==='verified'&&!uploadDateReady(item,today)||undefined}>{item.preview&&<Image unoptimized width={1920} height={1280} src={item.preview} alt="所选照片预览" decoding="async"/>}<div className="upload-info"><strong>{item.file.name}</strong><small>{(item.file.size/1024/1024).toFixed(1)} MB · {item.status==='verified'?'原件已验证':item.status==='verifying'?'正在验证原件':item.status==='preparing'?'正在准备上传…':item.status==='waiting'?'排队上传':item.status==='uploading'?`正在上传 ${item.progress}%`:item.error}</small>{item.status==='verified'&&<div className="media-date">
  {!item.capturedOn&&<small className="upload-attention">{uploadDateReady(item,today)?'拍摄日期未知，已确认归档日期':'拍摄日期未知，必须确认后保存'}</small>}
  <span>{item.dateEdited?'归档日期（已选择）':item.capturedOn?'拍摄日期':'确认归档日期'}</span>
  <DateField label={`${item.file.name}的日期`} min={BIRTHDAY} max={today} required disabled={disabled} value={item.occurredOn??''} onChange={value=>patch(item.key,{occurredOn:value,dateEdited:true})}/>
  {!item.capturedOn&&!uploadDateReady(item,today)&&<button type="button" disabled={disabled||!validEventDate(date,today)} onClick={()=>patch(item.key,{occurredOn:date,dateEdited:true})}>确认使用记录日期 {date}</button>}
  {item.occurredOn&&!validEventDate(item.occurredOn,today)&&<small role="alert">请选择出生日至今天之间的日期</small>}
 </div>}{['uploading','verifying'].includes(item.status)&&<progress max={100} value={item.progress}/>}</div>{item.status==='failed'&&!fileProblem(item.file.name,item.file.size)&&<button type="button" disabled={disabled} onClick={()=>retry(item)}>重试</button>}<button type="button" disabled={disabled} onClick={()=>remove(item)}>{item.status==='uploading'?'取消':'移除'}</button></li>)}</ul></details>}</section>;
}

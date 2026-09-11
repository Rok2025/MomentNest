'use client';
import {DateField} from './date-field';
import {UploadDrafts} from './upload-drafts';
import {useRef,useEffect,useState} from 'react';
import {uploadOriginal,type UploadAuth} from '@/domain/upload-original';
import {uploadProgress,formatUploadBytes} from '@/domain/upload-progress';
import {UploadQueue} from '@/domain/upload-queue';
import {hashFile} from '@/domain/file-hash';
import {monitorUploads} from '@/domain/upload-diagnostic';
import {fileProblem,MAX_FILES} from '@/domain/media';
import {BIRTHDAY,validEventDate} from '@/domain/dates';
import {uploadDateReady} from '@/domain/upload-date';
import type {DraftFile,DuplicateMedia} from '@/domain/upload-draft';
export type UploadItem={key:string;file:{name:string;size:number;type?:string;lastModified?:number};blob?:File;id?:string;sha256?:string;status:'hashing'|'preparing'|'waiting'|'uploading'|'verifying'|'verified'|'failed';progress:number;uploadedBytes?:number;error?:string;occurredOn?:string;capturedOn?:string|null;capturedText?:string|null;dateEdited?:boolean;dateSaving?:boolean;reused?:boolean;requestKey?:string};
type Ticket=UploadAuth&{name?:string;duplicate?:DuplicateMedia;reused?:boolean;archiveDate?:string|null};
// WebKit can prefer the current photo representation with image/*; listing HEIC
// alone can still select compatibility conversion. fileProblem remains the allowlist.
const accept='image/*,image/jpeg,image/png,image/webp,image/heic,image/heif,video/quicktime,video/mp4,.jpg,.jpeg,.png,.webp,.heic,.heif,.mov,.mp4,.m4v';
export function Uploader({items,onChange,disabled,onExpired,date,today,memberId}:{items:UploadItem[];onChange:(items:UploadItem[])=>void;disabled:boolean;onExpired:()=>void;date:string;today:string;memberId:string}){
 const details=useRef<HTMLDetailsElement>(null),current=useRef(items),mounted=useRef(true),batchId=useRef(''),controllers=useRef(new Map<string,AbortController>()),serial=useRef(Promise.resolve());
 const [queue]=useState(()=>new UploadQueue(2)),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[duplicates,setDuplicates]=useState<{name:string;existing?:DuplicateMedia}[]>([]),[restoreNotice,setRestoreNotice]=useState('');
 const marker=`momentnest:upload-page:${memberId}`;
 useEffect(()=>{current.current=items;},[items]);
 useEffect(()=>monitorUploads(memberId,()=>current.current),[memberId]);
 useEffect(()=>{
  mounted.current=true;
  try{const previous=JSON.parse(sessionStorage.getItem(marker)||'null');if(previous?.count)setTimeout(()=>{if(mounted.current)setRestoreNotice(`上次页面离开时有 ${previous.count} 份素材未保存，请从草稿中继续。读取中尚未登记的文件需要重新选择。`);},0);}catch{}
  const remember=()=>{try{sessionStorage.setItem(marker,JSON.stringify({count:current.current.length,at:Date.now(),event:'pagehide'}));}catch{}};
  window.addEventListener('pagehide',remember);
  const active=controllers.current;
  return()=>{mounted.current=false;queue.clear();active.forEach(c=>c.abort());window.removeEventListener('pagehide',remember);};
 },[queue,marker]);
 function publish(next:UploadItem[]){const countChanged=next.length!==current.current.length;current.current=next;onChange(next);if(countChanged)try{sessionStorage.setItem(marker,JSON.stringify({count:next.length,event:'updated'}));}catch{}}
 function present(key:string){return mounted.current&&current.current.some(i=>i.key===key);}
 function patch(key:string,values:Partial<UploadItem>){if(present(key))publish(current.current.map(i=>i.key===key?{...i,...values}:i));}
 async function api(path:string,body?:unknown,method='POST'){
  const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000),cache:'no-store'});
  let d;try{d=await r.json();}catch{throw Error(`服务返回异常（${r.status}），请稍后重试`);}
  if(r.status===401&&mounted.current)onExpired();if(!r.ok)throw Error(d.message||`请求失败（${r.status}）`);return d;
 }
 function reportDuplicate(item:UploadItem,existing?:DuplicateMedia){
  if(!present(item.key))return;
  publish(current.current.filter(i=>i.key!==item.key));setDuplicates(d=>[...d,{name:item.file.name,existing}]);
 }
 async function verify(item:UploadItem){
  patch(item.key,{status:'verifying',error:undefined});
  const result=await api('/api/uploads/complete',{id:item.id});
  if(!present(item.key))return;
  const latest=current.current.find(i=>i.key===item.key)!;
  const twin=current.current.find(i=>i.key!==item.key&&i.status==='verified'&&i.sha256===result.sha256&&i.file.size===item.file.size);
  if(result.duplicate||twin){reportDuplicate(item,result.duplicate||undefined);if(item.id&&item.id!==twin?.id)await api('/api/uploads/cancel',{id:item.id});return;}
  patch(item.key,{status:'verified',blob:undefined,sha256:result.sha256,progress:100,uploadedBytes:item.file.size,capturedOn:result.capturedOn,capturedText:result.capturedText,...(!latest.dateEdited?{occurredOn:result.archiveDate||result.capturedOn||'',dateEdited:!!result.archiveDate}:{})});
 }
 async function upload(item:UploadItem,prepared?:Ticket){
  if(!present(item.key))return;
  const controller=new AbortController();controllers.current.set(item.key,controller);
  try{
   if(!item.blob){await verify(item);return;}
   patch(item.key,{status:'preparing',error:undefined});
   const auth:Ticket=prepared||await api('/api/uploads/authorize',{name:item.file.name,size:item.file.size,...(item.id?{id:item.id}:{sha256:item.sha256,batchId:batchId.current,requestKey:item.requestKey,lastModified:item.file.lastModified})});
   if(!present(item.key))return;
   if(auth.duplicate){reportDuplicate(item,auth.duplicate);return;}
   patch(item.key,{id:auth.id,reused:auth.reused,file:{...item.file,name:auth.name||item.file.name}});
   if(!auth.verified){
    patch(item.key,{status:'uploading'});
    await uploadOriginal(item.blob,auth,{signal:controller.signal,progress:bytes=>patch(item.key,{uploadedBytes:bytes,progress:Math.floor(bytes/item.file.size*100)}),refresh:()=>api('/api/uploads/authorize',{id:auth.id,name:item.file.name,size:item.file.size})});
   }
   if(present(item.key))await verify({...item,id:auth.id});
  }catch(e){patch(item.key,{status:'failed',error:!item.blob?`未完成验证：${(e as Error).message}。如需续传，请重新选择原文件。`:(e as Error).message});}
  finally{if(controllers.current.get(item.key)===controller)controllers.current.delete(item.key);}
 }
 function enqueue(item:UploadItem,auth?:Ticket){patch(item.key,{status:'waiting',error:undefined});queue.add(item.key,()=>upload(item,auth),item.file.size);}
 async function prepare(item:UploadItem,replacement?:UploadItem){
  if(!present(item.key)||!item.blob)return;
  const controller=new AbortController();controllers.current.set(item.key,controller);
  try{
   patch(item.key,{status:'hashing',error:undefined});
   const hash=item.sha256||await hashFile(item.blob,controller.signal,p=>patch(item.key,{progress:p}));
   if(!present(item.key))return;
   if(replacement?.sha256&&replacement.sha256!==hash)throw Error('所选文件内容与原任务不同，请选择原文件');
   if(replacement&&!replacement.sha256&&(item.file.name!==replacement.file.name||item.file.size!==replacement.file.size))throw Error('请选择与原任务名称和大小一致的文件');
   const twin=current.current.find(i=>i.key!==item.key&&i.sha256===hash&&i.file.size===item.file.size);
   if(twin){
    if(!twin.blob&&twin.status!=='verified'){patch(twin.key,{blob:item.blob});enqueue({...twin,blob:item.blob});}
    reportDuplicate(item);return;
   }
   patch(item.key,{sha256:hash,status:'preparing',progress:0});
   const auth:Ticket=await api('/api/uploads/authorize',{name:item.file.name,size:item.file.size,sha256:hash,batchId:batchId.current,requestKey:item.requestKey,lastModified:item.file.lastModified});
   if(!present(item.key))return;
   if(auth.duplicate){reportDuplicate(item,auth.duplicate);return;}
   if(current.current.some(i=>i.key!==item.key&&i.id===auth.id)){reportDuplicate(item);return;}
   patch(item.key,{id:auth.id,reused:auth.reused,file:{...item.file,name:auth.name||item.file.name}});
   // A legacy incomplete draft has no reliable hash. Use a fresh session rather than mixing old chunks.
   if(replacement?.id&&replacement.id!==auth.id)await api('/api/uploads/cancel',{id:replacement.id});
   enqueue({...item,file:{...item.file,name:auth.name||item.file.name},id:auth.id,sha256:hash},auth);
  }catch(e){patch(item.key,{...(replacement?replacement:{}),status:'failed',error:(e as Error).message});}
  finally{if(controllers.current.get(item.key)===controller)controllers.current.delete(item.key);}
 }
 function schedule(item:UploadItem,replacement?:UploadItem){serial.current=serial.current.then(()=>prepare(item,replacement)).catch(()=>{});}
 function select(input:HTMLInputElement,replacement?:UploadItem){
  const files=Array.from(input.files||[]);input.value='';
  if(!files.length)return;
  if(files.length+(replacement?current.current.length-1:current.current.length)>MAX_FILES){setMessage(`每批最多${MAX_FILES}份素材，请减少选择；恢复的素材可以逐项重新选择原文件。`);return;}
  if(!batchId.current)batchId.current=crypto.randomUUID();setMessage('');
  const added=files.map(file=>({key:replacement?.key||crypto.randomUUID(),requestKey:crypto.randomUUID(),file:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified},blob:file,status:'waiting',progress:0} as UploadItem));
  publish(replacement?current.current.map(i=>i.key===replacement.key?added[0]:i):[...current.current,...added]);
  for(const item of added){const error=fileProblem(item.file.name,item.file.size);if(error)patch(item.key,{status:'failed',error});else schedule(item,replacement);}
 }
 function leaveDraft(){queue.clear();controllers.current.forEach(c=>c.abort());publish([]);setOpen(false);setMessage('已返回草稿列表。尚未登记的文件需要重新选择。');}
 function retry(item:UploadItem){if(item.id)enqueue(item);else if(item.blob)schedule(item);else setMessage('请重新选择原文件后继续');}
 async function remove(item:UploadItem){
  queue.remove(item.key);controllers.current.get(item.key)?.abort();
  try{if(item.id)await api('/api/uploads/cancel',{id:item.id});publish(current.current.filter(i=>i.key!==item.key));}catch(e){setMessage(`移除失败：${(e as Error).message}`);}
 }
 function restore(id:string,files:DraftFile[]){
  batchId.current=id;setMessage('已恢复草稿并开始核验。未传完的文件需要重新选择原文件。');setRestoreNotice('');
  const restored=files.map(f=>({key:f.id,id:f.id,file:{name:f.name,size:f.size,lastModified:f.lastModified??undefined},sha256:f.sha256||f.clientSha256||undefined,status:'waiting',progress:0,occurredOn:f.archiveDate||'',dateEdited:!!f.archiveDate} as UploadItem));
  publish(restored);for(const item of restored)queue.add(item.key,()=>upload(item),item.file.size);
 }
 async function changeDate(item:UploadItem,value:string){
  patch(item.key,{occurredOn:value,dateEdited:true,dateSaving:true});
  if(value&&!validEventDate(value,today)){patch(item.key,{dateSaving:false});return;}
  try{await api('/api/uploads/drafts',{id:item.id,date:value||null},'PATCH');patch(item.key,{dateSaving:false});}
  catch(e){patch(item.key,{dateSaving:false});setMessage(`草稿日期未同步：${(e as Error).message}。请重新选择日期。`);}
 }
 const summary=uploadProgress(items),pendingDates=items.filter(i=>i.status==='verified'&&!uploadDateReady(i,today));
 function confirmDates(){setOpen(true);if(details.current)details.current.open=true;requestAnimationFrame(()=>details.current?.scrollIntoView({block:'nearest'}));}
 const errorSummary=[...new Set(items.filter(i=>i.status==='failed').map(i=>i.error).filter(Boolean))];
 const label=(i:UploadItem)=>i.status==='verified'?'传输完成，待保存':i.status==='hashing'?`正在识别重复文件 ${i.progress}%`:i.status==='preparing'?'正在准备上传':i.status==='waiting'?'等待处理':i.status==='uploading'?`正在上传 ${i.progress}%`:i.status==='verifying'?'正在验证原件':i.error;
 return <>
 {!disabled&&!items.length&&<UploadDrafts onRestore={restore} disabled={disabled}/>}
 {restoreNotice&&<p className="upload-attention" role="status">{restoreNotice}</p>}
 <section className="upload-box"><label className="upload-picker">＋ 添加照片 / 视频<input className="sr-only" type="file" multiple accept={accept} disabled={disabled||items.length>=MAX_FILES} onChange={e=>select(e.currentTarget)} onInput={e=>select(e.currentTarget)}/></label>
 {message&&<p className="upload-attention" role="status">{message}</p>}
 {!!duplicates.length&&<div className="upload-duplicates" role="status"><p>已跳过 {duplicates.length} 份重复素材。</p><ul>{duplicates.map((d,i)=><li key={i}>{d.name} · {d.existing?<a href={`/events/${d.existing.eventId}`} target="_blank" rel="noreferrer">已收录于 {d.existing.occurredOn}，查看回忆</a>:'本批已添加或已恢复'}</li>)}</ul></div>}
 <details className="upload-help"><summary>格式和大小说明</summary><p>每批最多100份 · 照片50 MB / 视频1 GB。未保存草稿保留7天；手机刷新后可能需要重新选择未传完的原文件。Live Photo 请分别选择照片和视频。</p></details>
 {items.length>0&&<div className="upload-summary" aria-label="整体上传进度"><div><strong role="status">传输完成 {summary.completed}/{summary.count} · 待保存</strong><span>{summary.percent}%</span></div><progress aria-label="文件传输总进度" max={100} value={summary.percent}/><p>{summary.completed===summary.count?'文件已传输完成，请确认日期并点击保存。':`剩余上传 ${formatUploadBytes(summary.remaining)}`}{summary.failed?` · ${summary.failed} 份失败`:''}</p>{errorSummary.map(error=><p key={error} role="alert" className="upload-attention">{error}</p>)}<small>保存成功后才会收录到回忆。已传完的素材可以从草稿恢复。</small></div>}
 {items.length>0&&<button type="button" disabled={disabled} onClick={leaveDraft}>返回草稿列表</button>}
 {!!pendingDates.length&&<div className="upload-date-notice"><p role="status">{pendingDates.length} 份素材需要确认归档日期，确认后才能保存。</p><button type="button" disabled={disabled} onClick={confirmDates}>去确认日期</button></div>}
 {items.length>0&&<details ref={details} className="upload-details" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary><span>文件上传详情 · {items.length} 份</span><span>{open?'收起':'展开'}</span></summary>{open&&<ul className="upload-list">{items.map(item=><li key={item.key}><div className="upload-info"><strong>{item.file.name}</strong><small>{formatUploadBytes(item.file.size)} · {label(item)}</small>{item.reused&&<small>已复用之前的上传任务</small>}{item.status==='verified'&&<div className="media-date">{!item.capturedOn&&<small className="upload-attention">拍摄日期未知，必须确认后保存</small>}<span>{item.dateEdited?'归档日期（已选择）':item.capturedOn?'拍摄日期':'确认归档日期'}</span><DateField label={`${item.file.name}的日期`} min={BIRTHDAY} max={today} required disabled={disabled||item.dateSaving} value={item.occurredOn||''} onChange={value=>void changeDate(item,value)}/>{!item.capturedOn&&!uploadDateReady(item,today)&&<button type="button" disabled={disabled||item.dateSaving} onClick={()=>void changeDate(item,date)}>确认使用记录日期 {date}</button>}</div>}</div>{(item.status==='failed'||item.status==='verified')&&<button type="button" disabled={disabled} onClick={()=>retry(item)}>{item.status==='failed'&&item.blob?'重试':'重新核验'}</button>}{!item.blob&&item.status==='failed'&&<label className="button">重新选择原文件<input className="sr-only" type="file" accept={accept} disabled={disabled} onChange={e=>select(e.currentTarget,item)}/></label>}<button type="button" disabled={disabled} onClick={()=>void remove(item)}>{['uploading','hashing'].includes(item.status)?'取消':'移除'}</button></li>)}</ul>}</details>}
 </section></>;
}

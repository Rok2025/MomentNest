'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {MediaRecord} from '@/domain/media';
import {captureTimeInputValue} from '@/domain/media-capture-time';
import styles from './media-viewer.module.css';

export function MediaTimeEditor({media,onCancel,onSaved}:{media:MediaRecord;onCancel:()=>void;onSaved:(media:MediaRecord)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [current,setCurrent]=useState<MediaRecord|null>(null),[value,setValue]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{
  const element=dialog.current!,trigger=document.activeElement as HTMLElement|null;
  const controller=new AbortController();element.showModal();
  async function load(){
   try{
    const response=await fetch(`/api/media/${media.id}/capture-time`,{cache:'no-store',signal:controller.signal});
    const result=await response.json();if(!response.ok)throw Error(result.message||'暂时无法读取拍摄时间');
    if(!controller.signal.aborted){setCurrent(result);setValue(captureTimeInputValue(result.capturedText,result.capturedZone));setLoading(false);requestAnimationFrame(()=>input.current?.focus());}
   }catch(error){if(!controller.signal.aborted){setError((error as Error).message);setLoading(false);}}
  }
  void load();return()=>{controller.abort();element.close();trigger?.focus({preventScroll:true});};
 },[media.id]);
 async function save(event:FormEvent){
  event.preventDefault();if(!current||busy)return;setBusy(true);setError('');
  try{
   const response=await fetch(`/api/media/${media.id}/capture-time`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({capturedTime:value,expectedOverride:current.captureTimeOverride??null})});
   const result=await response.json();if(!response.ok)throw Error(result.message||'时间保存失败，请重试');
   onSaved(result);
  }catch(error){setError((error as Error).message);setBusy(false);}
 }
 return <dialog ref={dialog} className={styles.timeEditor} aria-labelledby="media-time-title" onKeyDown={event=>event.stopPropagation()} onCancel={event=>{event.preventDefault();event.stopPropagation();if(!busy)onCancel();}} onClose={event=>event.stopPropagation()}>
  <form onSubmit={event=>void save(event)}>
   <h2 id="media-time-title">编辑拍摄时间</h2>
   <p className={styles.editFilename} title={media.filename}>{media.filename}</p>
   <label htmlFor="media-capture-time">拍摄时间 · 北京时间</label>
   <input ref={input} id="media-capture-time" type="datetime-local" step="1" min="1970-01-01T00:00:00" max="9999-12-31T23:59:59" required disabled={loading||busy||!current} value={value} onChange={event=>setValue(event.target.value)}/>
   <p className={styles.editHint}>仅更新当前文件的拍摄时间，原件和所属记录日期保持不变。</p>
   {loading&&<p role="status">正在读取当前时间…</p>}
   {error&&<p className={styles.editError} role="alert">{error}</p>}
   <div className={styles.editActions}><button type="button" disabled={busy} onClick={onCancel}>取消</button><button type="submit" disabled={loading||busy||!current} className="primary">{busy?'正在保存…':'保存时间'}</button></div>
  </form>
 </dialog>;
}

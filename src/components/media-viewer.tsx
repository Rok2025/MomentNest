'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type TouchEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {PreviewLinks,MediaRecord} from '@/domain/media';
import {formatCaptureTime} from '@/domain/capture-date';
import {getMediaLink,MediaView} from './media-gallery';
import {MediaTimeEditor} from './media-time-editor';
import styles from './media-viewer.module.css';

function preloadAdjacent(previews:(PreviewLinks|undefined)[]){
 for(const preview of previews){
  if(!preview||preview.expiresAt<=Date.now()+30000)continue;
  const image=new Image();image.sizes='100vw';if(preview.srcSet)image.srcset=preview.srcSet;image.src=preview.url;
 }
}

export function MediaViewer({items,selectedId,date,onSelect,onClose,onMediaChange}:{items:MediaRecord[];selectedId:string;date:string;onSelect:(id:string)=>void;onClose:()=>void;onMediaChange:(media:MediaRecord)=>void}){
 const router=useRouter();
 const dialog=useRef<HTMLDialogElement>(null);
 // Keep this viewing session stable even when a time correction changes sorting.
 const [order]=useState(()=>items.map(media=>media.id));
 const byId=new Map(items.map(media=>[media.id,media]));
 const ordered=order.flatMap(id=>{const item=byId.get(id);return item?[item]:[];});
 const index=ordered.findIndex(media=>media.id===selectedId),media=ordered[index];
 const [editing,setEditing]=useState(false),[downloading,setDownloading]=useState(false),[message,setMessage]=useState('');
 const [playing,setPlaying]=useState(false),[controlsVisible,setControlsVisible]=useState(true);
 const idle=useRef<ReturnType<typeof setTimeout>|null>(null);
 const touch=useRef<{x:number;y:number}|null>(null);
 const downloadRequest=useRef(0);
 const suppressClickUntil=useRef(0);
 const previous=ordered[index-1]?.preview,next=ordered[index+1]?.preview;

 useEffect(()=>{
  const element=dialog.current!,requestCounter=downloadRequest;const overflow=document.body.style.overflow;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null,scrollY=window.scrollY;
  element.showModal();document.body.style.overflow='hidden';
  return()=>{requestCounter.current++;element.close();document.body.style.overflow=overflow;trigger?.focus({preventScroll:true});window.scrollTo({top:scrollY,behavior:'instant'});};
 },[]);
 useEffect(()=>{
  preloadAdjacent([previous,next]);
 },[previous,next]);
 useEffect(()=>{
  if(playing&&!editing)idle.current=setTimeout(()=>setControlsVisible(false),2500);
  return()=>{if(idle.current)clearTimeout(idle.current);};
 },[playing,editing,selectedId]);
 function reveal(){
  setControlsVisible(true);if(idle.current)clearTimeout(idle.current);
  if(playing&&!editing)idle.current=setTimeout(()=>setControlsVisible(false),2500);
 }
 function select(offset:number){
  const target=ordered[index+offset];if(!target||editing)return;
  dialog.current?.querySelector('video')?.pause();
  downloadRequest.current++;setDownloading(false);setPlaying(false);setControlsVisible(true);setMessage('');onSelect(target.id);
 }
 function keyDown(event:KeyboardEvent<HTMLDialogElement>){
  if(editing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  // Video controls own arrows for seeking/volume; form fields own text navigation.
  if(event.target instanceof Element&&event.target.closest('video,input,textarea,select,[contenteditable="true"]'))return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(event.key==='ArrowLeft'?-1:1);reveal();}
 }
 function touchStart(event:TouchEvent<HTMLDivElement>){
  touch.current=null;if(editing||event.touches.length!==1)return;
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('button,a,input')&&!target.closest('.video-cover-play'))return;
  // Keep the native video scrubber separate from horizontal browsing.
  const player=target?.closest('video');
  if(player&&event.touches[0].clientY>player.getBoundingClientRect().bottom-72)return;
  touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};
 }
 function touchEnd(event:TouchEvent<HTMLDivElement>){
  const start=touch.current;touch.current=null;if(!start||event.changedTouches.length!==1)return;
  const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;
  if(Math.abs(dx)>=60&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil.current=event.timeStamp+400;select(dx<0?1:-1);}
 }
 async function download(){
  if(!media||downloading)return;
  const request=++downloadRequest.current;setDownloading(true);setMessage('');
  try{const result=await getMediaLink(media.id,'original');if(request===downloadRequest.current)window.location.assign(result.url);}
  catch{if(request===downloadRequest.current)setMessage('原件暂不可用，请稍后重试');}
  finally{if(request===downloadRequest.current)setDownloading(false);}
 }
 const fullTime=media?formatCaptureTime(media.capturedText,media.capturedZone):'未知';
 const shortTime=fullTime==='未知'?'拍摄时间未知':fullTime.replace(/:\d{2}（北京时间）$/,'').replace(/:\d{2}（时区未知）$/,' · 时区未知');
 return <dialog ref={dialog} className={styles.viewer} aria-label={`${date}的照片与视频`} data-idle={playing&&!editing&&!controlsVisible} onKeyDown={keyDown} onPointerMove={reveal} onPointerDownCapture={reveal} onCancel={event=>{event.preventDefault();onClose();}} onClose={()=>{if(!dialog.current?.open)onClose();}}>
  <div className={`${styles.topbar} ${styles.controls}`}>
   <span className={styles.counter} role="status" aria-live="polite" aria-atomic="true">{index+1} / {ordered.length}</span>
   <button type="button" className={styles.close} onClick={onClose} aria-label="关闭查看器" title="关闭（Esc）">×</button>
  </div>
  {media&&<>
   <div className={styles.stage} onClickCapture={event=>{if(event.timeStamp<suppressClickUntil.current){event.preventDefault();event.stopPropagation();}}} onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={()=>{touch.current=null;}}>
    <MediaView key={media.id} media={media} immersive priority onRetry={()=>router.refresh()} onPlaybackChange={value=>{setPlaying(value);setControlsVisible(true);}}/>
    {ordered.length>1&&<>
     <button type="button" className={`${styles.arrow} ${styles.previous} ${styles.controls}`} disabled={index<=0} onClick={()=>select(-1)} aria-label="上一张照片或视频" title="上一张（←）">‹</button>
     <button type="button" className={`${styles.arrow} ${styles.next} ${styles.controls}`} disabled={index>=ordered.length-1} onClick={()=>select(1)} aria-label="下一张照片或视频" title="下一张（→）">›</button>
    </>}
   </div>
   <footer className={`${styles.footer} ${styles.controls}`}>
    <div className={styles.metadata}>
     <span title={fullTime}>{shortTime}</span>
     <details className={styles.filename}><summary title={media.filename}><span>{media.filename.length>36?`${media.filename.slice(0,18)}…${media.filename.slice(-14)}`:media.filename}</span></summary><div>{media.filename}<br/>{fullTime}</div></details>
    </div>
    <div className={styles.actions}>
     <button type="button" onClick={()=>{dialog.current?.querySelector('video')?.pause();setEditing(true);}}>编辑时间</button>
     <button type="button" disabled={downloading} onClick={()=>void download()}>{downloading?'准备下载…':'下载原件'}</button>
    </div>
   </footer>
   {message&&<p className={styles.message} role="status">{message}</p>}
   {editing&&<MediaTimeEditor media={media} onCancel={()=>{setEditing(false);setControlsVisible(true);}} onSaved={updated=>{onMediaChange({...media,...updated});setEditing(false);setMessage('拍摄时间已更新');setControlsVisible(true);}}/>}
  </>}
 </dialog>;
}

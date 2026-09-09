'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {MediaRecord} from '@/domain/media';
import {MediaView} from './media-gallery';
import styles from './journal-day.module.css';

export function MediaViewer({items,selectedId,date,onSelect,onClose,onRemember}:{items:MediaRecord[];selectedId:string;date:string;onSelect:(id:string)=>void;onClose:()=>void;onRemember:(media:MediaRecord)=>void}){
 const router=useRouter();
 const dialog=useRef<HTMLDialogElement>(null);
 const index=items.findIndex(m=>m.id===selectedId),media=items[index];
 useEffect(()=>{
  const element=dialog.current!;const overflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return()=>{element.close();document.body.style.overflow=overflow;};
 },[]);
 useEffect(()=>{if(dialog.current)dialog.current.scrollTop=0;},[selectedId]);
 return <dialog ref={dialog} className={`new-event-dialog ${styles.viewer}`} aria-label={`${date}的照片与视频详情`} onCancel={event=>{event.preventDefault();onClose();}} onClose={onClose}>
  <div className="dialog-bar"><span>{date} · {media?.kind==='video'?'视频':'照片'}</span><button type="button" onClick={onClose} aria-label="关闭素材详情">关闭 ×</button></div>
  {media&&<div className={styles.viewerBody}>
   <nav className={styles.viewerNav} aria-label="切换素材"><button disabled={index<=0} onClick={()=>onSelect(items[index-1].id)}>← 上一份</button><span>{index+1} / {items.length}</span><button disabled={index>=items.length-1} onClick={()=>onSelect(items[index+1].id)}>下一份 →</button></nav>
   <MediaView key={media.id} media={media} priority onRetry={()=>router.refresh()}/>
   <Link href={`/events/${media.eventId}`} onClick={()=>onRemember(media)}>查看所属记录 / 编辑 →</Link>
  </div>}
 </dialog>;
}

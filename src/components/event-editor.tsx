'use client';
import { DateField } from './date-field';
import { Uploader,type UploadItem } from './uploader';
import { MediaGallery } from './media-gallery';
import type { MediaRecord } from '@/domain/media';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveEventAction } from '@/app/actions/events';
import { BIRTHDAY,todayShanghai,validEventDate } from '@/domain/dates';
import type { EventInput,EventRecord } from '@/domain/events';
import { AuthForm } from './auth-form';
export function EventEditor({initial,today,memberId,media=[],preview=false,onClose,onSaved,onSavingChange}:{initial?:EventRecord;today:string;memberId:string;media?:MediaRecord[];preview?:boolean;onClose?:()=>void;onSaved?:(id:string)=>void;onSavingChange?:(saving:boolean)=>void}){
  const router=useRouter();
  const [uploads,setUploads]=useState<UploadItem[]>([]),[cover,setCover]=useState<string|null>(initial?.coverMediaId||null);
  const uploadsReady=uploads.every(u=>u.status==='verified');
  const [date,setDate]=useState(initial?.occurredOn||today),[max,setMax]=useState(today),[body,setBody]=useState([initial?.title,initial?.body,initial?.feeling].filter(Boolean).join('\n\n'));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[needsLogin,setNeedsLogin]=useState(false),[uncertain,setUncertain]=useState(false),[latest,setLatest]=useState<EventRecord|null>(null),[version,setVersion]=useState(initial?.version);
  const attempt=useRef<EventInput|null>(null),saving=useRef(false);
  const saveCount=new Set([...(initial||body.trim()?[date]:[]),...uploads.map(u=>u.occurredOn??date)]).size;
  useEffect(()=>{const refresh=()=>setMax(todayShanghai());const id=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(id);window.removeEventListener('focus',refresh);};},[]);
  async function save(){
    if(preview){setMessage('这是界面预览，请从正式记录入口保存。');return;}
    if(saving.current||!uploadsReady)return;
    saving.current=true;setBusy(true);onSavingChange?.(true);setMessage('');
    if(!attempt.current)attempt.current={requestKey:crypto.randomUUID(),...(initial?{id:initial.id,expectedVersion:version}:{}),occurredOn:date,title:'',body,feeling:'',uploadIds:uploads.map(u=>u.id!),uploadDates:uploads.map(u=>({id:u.id!,occurredOn:u.occurredOn??date})),...(initial?{coverMediaId:cover}:{})};
    try{
      const result=await saveEventAction(attempt.current);
      if(result.ok){if(onSaved)onSaved(result.id);else{router.push(`/?saved=1#event-${result.id}`);router.refresh();}return;}
      setMessage(result.message);
      if(result.code==='UNAUTHENTICATED'){setNeedsLogin(true);}
      else if(result.code==='UNAVAILABLE'){setUncertain(true);}
      else{
        attempt.current=null;setUncertain(false);
        if(result.code==='CONFLICT'&&initial){
          const res=await fetch(`/api/events/${initial.id}`,{cache:'no-store'});
          if(res.ok)setLatest(await res.json());
        }
      }
    }catch{setUncertain(true);setMessage('尚未确认保存结果。请重试确认；同一次保存不会重复创建。');}
    finally{saving.current=false;setBusy(false);onSavingChange?.(false);}
  }
  return <section className="editor panel"><div className={onClose?"sr-only":"section-heading"}><div><h1>{initial?'补充这段回忆':'记下一刻'}</h1></div>{!onClose&&<Link href={initial?`/events/${initial.id}`:'/'}>返回</Link>}</div>
    <form className="form-stack" onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={busy||uncertain||needsLogin}>
        <label className="editor-date">记录日期<DateField name="occurredOn" label="记录日期" required min={BIRTHDAY} max={max} value={date} onChange={setDate}/></label>
        <label className="sr-only" htmlFor="memory-body">记录内容</label>
        <textarea id="memory-body" aria-label="记录内容" maxLength={20000} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="写下这一刻，或直接添加照片和视频…"/>
        <Uploader items={uploads} onChange={setUploads} date={date} today={max} disabled={preview||busy||uncertain||needsLogin} existing={initial?.mediaCount||0} onExpired={()=>setNeedsLogin(true)}/>
        {uploads.length>0&&<p className="muted">文字按上方日期保存，照片和视频按各自日期归档；跨天会分成多条回忆。</p>}
        {media.length>0&&<label>首页封面<select value={cover||''} onChange={e=>setCover(e.target.value||null)}><option value="">第一份素材</option>{media.map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>}
      </fieldset>
      {body.length>20000&&<p role="alert">原有文字已完整保留，请整理到20000字以内后保存。</p>}
      <p aria-live="polite" role="alert">{message}</p>
      <div className="editor-actions"><button className="primary" disabled={busy||needsLogin||!uploadsReady||(!uncertain&&(!validEventDate(date,max)||(!body.trim()&&!uploads.length&&!initial?.mediaCount)||body.length>20000||uploads.some(u=>!validEventDate(u.occurredOn??date,max))))}>{busy?'正在保存…':uncertain?'重试确认这次保存':saveCount>1?`保存 ${saveCount} 条回忆`:'保存'}</button>{onClose&&<button type="button" disabled={busy} onClick={onClose}>暂时关闭</button>}</div>
      {uncertain&&<p className="muted">先确认这次保存结果，再修改内容。当前输入保留在此页面。</p>}
    </form>
    {initial&&media.length>0&&<MediaGallery eventId={initial.id} initial={media}/>}
    {needsLogin&&<aside className="notice"><h2>重新登录后继续</h2><p>请使用原账号，你的输入仍保留。</p><AuthForm expectedMemberId={memberId} onSuccess={()=>{setNeedsLogin(false);setMessage('已重新登录，可以继续保存');}}/></aside>}
    {latest&&<aside className="notice"><h2>另一位家长保存的最新内容</h2><h3>{latest.title}</h3><p className="preserve">{latest.body}</p><p className="preserve">{latest.feeling}</p><p>你的输入未被替换。请比较后决定要保留的内容。</p><button onClick={()=>{setVersion(latest.version);setLatest(null);attempt.current=null;setMessage('已读取最新版本。请确认上方内容后重新保存。');}}>我已比较，继续编辑上方内容</button></aside>}
  </section>;
}

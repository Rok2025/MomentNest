'use client';
import { Uploader,type UploadItem } from './uploader';
import { MediaGallery } from './media-gallery';
import type { MediaRecord } from '@/domain/media';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveEventAction } from '@/app/actions/events';
import { ageOn,BIRTHDAY,todayShanghai,validEventDate } from '@/domain/dates';
import type { EventInput,EventRecord } from '@/domain/events';
import { AuthForm } from './auth-form';
export function EventEditor({initial,today,memberId,media=[],preview=false}:{initial?:EventRecord;today:string;memberId:string;media?:MediaRecord[];preview?:boolean}){
  const router=useRouter();
  const [uploads,setUploads]=useState<UploadItem[]>([]),[cover,setCover]=useState<string|null>(initial?.coverMediaId||null);
  const uploadsReady=uploads.every(u=>u.status==='verified');
  const [date,setDate]=useState(initial?.occurredOn||today),[max,setMax]=useState(today),[title,setTitle]=useState(initial?.title||''),[body,setBody]=useState(initial?.body||''),[feeling,setFeeling]=useState(initial?.feeling||'');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[needsLogin,setNeedsLogin]=useState(false),[uncertain,setUncertain]=useState(false),[latest,setLatest]=useState<EventRecord|null>(null),[version,setVersion]=useState(initial?.version);
  const attempt=useRef<EventInput|null>(null),saving=useRef(false);
  useEffect(()=>{const refresh=()=>setMax(todayShanghai());const id=setInterval(refresh,30000);window.addEventListener('focus',refresh);return()=>{clearInterval(id);window.removeEventListener('focus',refresh);};},[]);
  async function save(){
    if(preview){setMessage('这是界面预览，请从正式记录入口保存。');return;}
    if(saving.current||!uploadsReady)return;
    saving.current=true;setBusy(true);setMessage('');
    if(!attempt.current)attempt.current={requestKey:crypto.randomUUID(),...(initial?{id:initial.id,expectedVersion:version}:{}),occurredOn:date,title,body,feeling,uploadIds:uploads.map(u=>u.id!),...(initial?{coverMediaId:cover}:{})};
    try{
      const result=await saveEventAction(attempt.current);
      if(result.ok){router.push(`/?saved=1&start=${date}&end=${date}#event-${result.id}`);router.refresh();return;}
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
    finally{saving.current=false;setBusy(false);}
  }
  return <section className="editor panel"><div className="section-heading"><div><p className="eyebrow">留下这一刻</p><h1>{initial?'补充这段回忆':'今天，想留下什么？'}</h1></div><Link href={initial?`/events/${initial.id}`:'/'}>返回</Link></div>
    <form className="form-stack" onSubmit={e=>{e.preventDefault();void save();}}>
      <fieldset disabled={busy||uncertain||needsLogin}>
        <label>事情发生在哪一天<input name="occurredOn" required type="date" min={BIRTHDAY} max={max} value={date} onInput={e=>setDate(e.currentTarget.value)} onChange={e=>setDate(e.target.value)}/></label>
        {validEventDate(date,max)&&<span className="age">{ageOn(date)}</span>}<p className="muted">北京时间 · 补录请选择真实发生日期</p>
        <label>一句标题 <span className="muted">（可不填）</span><input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="给这段回忆起个名字"/></label>
        <label>这一刻发生了什么<textarea maxLength={20000} rows={7} value={body} onChange={e=>setBody(e.target.value)} placeholder="写下又又的表现，也可以只写你的感受…"/></label>
        <label>当时的感受 <span className="muted">（可不填）</span><textarea rows={3} maxLength={5000} value={feeling} onChange={e=>setFeeling(e.target.value)}/></label>
        <Uploader items={uploads} onChange={setUploads} disabled={preview||busy||uncertain||needsLogin} existing={initial?.mediaCount||0} onExpired={()=>setNeedsLogin(true)}/>
        {media.length>0&&<label>首页封面<select value={cover||''} onChange={e=>setCover(e.target.value||null)}><option value="">第一份素材</option>{media.map(m=><option key={m.id} value={m.id}>{m.filename}</option>)}</select></label>}
      </fieldset>
      <p aria-live="polite" role="alert">{message}</p>
      <button className="primary" disabled={busy||needsLogin||!uploadsReady||(!uncertain&&(!validEventDate(date,max)||(!body.trim()&&!feeling.trim()&&!uploads.length&&!initial?.mediaCount)))}>{busy?'正在保存…':uncertain?'重试确认这次保存':'保存'}</button>
      {uncertain&&<p className="muted">先确认这次保存结果，再修改内容。当前输入保留在此页面。</p>}
    </form>
    {initial&&media.length>0&&<MediaGallery eventId={initial.id} initial={media}/>}
    {needsLogin&&<aside className="notice"><h2>重新登录后继续</h2><p>请使用原账号，你的输入仍保留。</p><AuthForm expectedMemberId={memberId} onSuccess={()=>{setNeedsLogin(false);setMessage('已重新登录，可以继续保存');}}/></aside>}
    {latest&&<aside className="notice"><h2>另一位家长保存的最新内容</h2><h3>{latest.title}</h3><p className="preserve">{latest.body}</p><p className="preserve">{latest.feeling}</p><p>你的输入未被替换。请比较后决定要保留的内容。</p><button onClick={()=>{setVersion(latest.version);setLatest(null);attempt.current=null;setMessage('已读取最新版本。请确认上方内容后重新保存。');}}>我已比较，继续编辑上方内容</button></aside>}
  </section>;
}

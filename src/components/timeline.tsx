'use client';
import Link from 'next/link';
import { useState,useRef,useEffect } from 'react';
import { Heatmap } from './heatmap';
import { Cover } from './media-gallery';
import { ageOn,isCalendarDate } from '@/domain/dates';
import type { DayCount,WindowState } from '@/domain/heatmap';
import type { EventRecord } from '@/domain/events';
import type { Cursor } from '@/server/event-store';
export function Timeline({initial,days,today,memberId,initialRange,initialPages=1,demoEvents}:{initial:{items:EventRecord[];next:Cursor|null};days:DayCount[];today:string;memberId:string;initialRange?:{start:string;end:string};initialPages?:number;demoEvents?:EventRecord[]}){
 const [restoredWindow,setRestoredWindow]=useState<WindowState|undefined>(undefined);
 const [page,setPage]=useState(initial),[range,setRange]=useState(initialRange),[pages,setPages]=useState(initialPages),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null),view=useRef<WindowState|undefined>(undefined);
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(`momentnest:view:${memberId}`)||'null');const w=saved?.window;if(location.hash&&w&&['day','week','month'].includes(w.grain)&&[w.start,w.end,w.focus].every(isCalendarDate)&&w.start>='2025-01-01'&&w.end<=today.slice(0,4)+'-12-31'&&w.start<=w.end){
 // Restore this account's local navigation state after hydration.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 setRestoredWindow(w);}}catch{}const anchor=decodeURIComponent(location.hash.slice(1));if(anchor.startsWith('event-'))requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView({block:'center'}));return()=>request.current?.abort();},[memberId,today]);
 function remember(e:EventRecord){sessionStorage.setItem(`momentnest:view:${memberId}`,JSON.stringify({url:location.pathname+location.search,anchor:`event-${e.id}`,window:view.current}));}
 async function load(nextRange:{start:string;end:string}|undefined,more=false){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  const q=new URLSearchParams(nextRange||{});if(more&&page.next){q.set('date',page.next.date);q.set('at',page.next.createdAt);q.set('id',page.next.id);}
  try{if(demoEvents){const filtered=demoEvents.filter(e=>!nextRange||(e.occurredOn>=nextRange.start&&e.occurredOn<=nextRange.end));setPage({items:filtered,next:null});setRange(nextRange);setPages(1);return;}const r=await fetch('/api/events?'+q,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error(r.status===401?'登录已过期，请重新登录':'暂时无法读取回忆，请重试');const result=await r.json();setPage({items:more?[...page.items,...result.items]:result.items,next:result.next});setRange(nextRange);const count=more?pages+1:1;setPages(count);const u=new URLSearchParams(nextRange||{});if(count>1)u.set('pages',String(count));history.replaceState(null,'','/'+(u.size?'?'+u:''));}
  catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <><Heatmap key={JSON.stringify(restoredWindow)||'default'} initialWindow={restoredWindow} today={today} days={days} onSelect={(start,end)=>void load({start,end})} onWindowChange={s=>{view.current=s;}}/>
 <div className="timeline-heading"><div><p className="eyebrow">一点一点，长大了</p><h2>{range?'这一段时光':'我们的成长手账'}</h2>{range&&<p className="muted">{range.start} — {range.end}</p>}</div>{range&&<button onClick={()=>void load(undefined)} disabled={busy}>查看全部回忆</button>}</div>
 {error&&<div className="notice" role="alert">{error} <button onClick={()=>void load(range)}>重试</button></div>}
 <div aria-busy={busy}>{!page.items.length?<section className="panel empty"><div className="empty-mark">✦</div><h2>{range?'这一段日子，还没有记录':'第一段回忆，从这里开始'}</h2><p>第一次伸手、一个小小的笑容，或是今天的心情。</p><Link className="button primary" href="/events/new">记下一刻</Link></section>:<section className="timeline" aria-label="按发生日期倒序的回忆">{page.items.map((e,i)=>{const month=e.occurredOn.slice(0,7),heading=month!==page.items[i-1]?.occurredOn.slice(0,7);return <div key={e.id}>{heading&&<h2 className="chapter"><small>{month.slice(0,4)} 年</small>{Number(month.slice(5))} 月</h2>}<article id={`event-${e.id}`} className={`entry ${i%2?'right':''}`}><div className="stamp"><span>{Number(e.occurredOn.slice(8))}日</span></div><div className="memory panel"><div className="card-top"><small>{e.author}记录</small><span className="age">{ageOn(e.occurredOn)}</span></div><h2><Link href={`/events/${e.id}`} onClick={()=>remember(e)}>{e.title||'一个想留下的瞬间'}</Link></h2>{e.mediaCount>0&&<Link className="cover-link" href={`/events/${e.id}`} onClick={()=>remember(e)}><Cover eventId={e.id} id={e.coverMediaId}/></Link>}<p className="excerpt">{e.body||e.feeling}</p><div className="card-bottom"><span className="muted">{e.mediaCount?[e.imageCount?`${e.imageCount} 张照片`:'',e.videoCount?`${e.videoCount} 段视频`:''].filter(Boolean).join(' · '):'文字回忆'}</span><Link href={`/events/${e.id}`} onClick={()=>remember(e)}>慢慢回看 →</Link></div></div></article></div>;})}</section>}</div>
 <nav className="pager">{page.next&&<button disabled={busy} onClick={()=>void load(range,true)}>{busy?'正在翻开…':'更早的回忆 ↓'}</button>}</nav></>;
}

'use client';
import { useState,useRef,useEffect,useId,useCallback } from 'react';
import { Heatmap } from './heatmap';
import { NewEventButton } from './new-event-dialog';
import { JournalDay } from './journal-day';
import { journalDays } from '@/domain/journal-days';
import { isCalendarDate } from '@/domain/dates';
import { addDays,addMonths,type DayCount,type WindowState } from '@/domain/heatmap';
import { mediaPending,reusePreview,type MediaRecord } from '@/domain/media';
import { pollWhileVisible } from '@/domain/visible-poll';
import type { EventRecord } from '@/domain/events';
import type { Cursor } from '@/server/event-store';
export function Timeline({initial,days,today,memberId,initialRange,initialPages=1,demoEvents,filtersOpen=true}:{initial:{items:EventRecord[];next:Cursor|null};days:DayCount[];today:string;memberId:string;initialRange?:{start:string;end:string};initialPages?:number;demoEvents?:EventRecord[];filtersOpen?:boolean}){
 const calendarId=useId();
 const [calendar,setCalendar]=useState({open:false,mounted:false});
 const total=days.reduce((sum,day)=>sum+day.count,0);
 const months=[...new Set(days.filter(day=>day.count>0).map(day=>day.date.slice(0,7)))].sort().reverse();
 const [restoredWindow,setRestoredWindow]=useState<WindowState|undefined>(undefined);
 const [page,setPage]=useState(initial),[range,setRange]=useState(initialRange),[pages,setPages]=useState(initialPages),[busy,setBusy]=useState(false),[error,setError]=useState<{message:string;range:{start:string;end:string}|undefined;more:boolean}|null>(null);
 // Server refreshes after saving must update the feed without remounting its calendar.
 const [previousInitial,setPreviousInitial]=useState(initial);
 if(previousInitial!==initial){setPreviousInitial(initial);setPage(initial);setRange(initialRange);setPages(initialPages);setBusy(false);setError(null);}
 const request=useRef<AbortController|null>(null),view=useRef<WindowState|undefined>(undefined);
 const loadMoreTarget=useRef<HTMLDivElement|null>(null);
 useEffect(()=>()=>request.current?.abort(),[initial]);
 useEffect(()=>{try{const saved=JSON.parse(sessionStorage.getItem(`momentnest:view:${memberId}`)||'null');const w=saved?.window;if(location.hash&&w&&['day','week','month'].includes(w.grain)&&[w.start,w.end,w.focus].every(isCalendarDate)&&w.start>='2025-01-01'&&w.end<=today.slice(0,4)+'-12-31'&&w.start<=w.end){
 // Restore this account's local navigation state after hydration.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 setRestoredWindow(w);}}catch{}const anchor=decodeURIComponent(location.hash.slice(1));if(anchor.startsWith('event-'))requestAnimationFrame(()=>document.getElementById(anchor)?.scrollIntoView({block:'center'}));return()=>request.current?.abort();},[memberId,today]);
 function remember(e:EventRecord){sessionStorage.setItem(`momentnest:view:${memberId}`,JSON.stringify({url:location.pathname+location.search,anchor:`event-${e.id}`,window:view.current}));}
 const load=useCallback(async(nextRange:{start:string;end:string}|undefined,more=false)=>{
  if(more&&(!page.next||(request.current&&!request.current.signal.aborted)))return;
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError(null);
  const q=new URLSearchParams(nextRange||{});if(more&&page.next){q.set('date',page.next.date);q.set('at',page.next.createdAt);q.set('id',page.next.id);}
  try{if(demoEvents){const filtered=demoEvents.filter(e=>!nextRange||(e.occurredOn>=nextRange.start&&e.occurredOn<=nextRange.end));setPage({items:filtered,next:null});setRange(nextRange);setPages(1);return;}const r=await fetch('/api/events?'+q,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error(r.status===401?'登录已过期，请重新登录':'暂时无法读取回忆，请重试');const result=await r.json();if(controller.signal.aborted)return;setPage(current=>({items:more?[...current.items,...result.items]:result.items,next:result.next}));setRange(nextRange);const count=more?pages+1:1;setPages(count);const u=new URLSearchParams(nextRange||{});if(count>1)u.set('pages',String(count));history.replaceState(null,'','/'+(u.size?'?'+u:''));}
  catch(e){if(!controller.signal.aborted){setError({message:(e as Error).message,range:nextRange,more});}}finally{if(request.current===controller){request.current=null;if(!controller.signal.aborted)setBusy(false);}}
 },[page.next,pages,demoEvents]);
 useEffect(()=>{
  const target=loadMoreTarget.current;
  if(!target||!page.next||busy||error)return;
  const observer=new IntersectionObserver(entries=>{
   if(entries.some(entry=>entry.isIntersecting))void load(range,true);
  },{rootMargin:'0px 0px 400px 0px'});
  observer.observe(target);
  return()=>observer.disconnect();
 },[page.next,busy,error,range,load]);
 const pendingCovers=page.items.filter(e=>(e.media??(e.cover?[e.cover]:[])).some(mediaPending)).map(e=>e.id).slice(0,100).join(',');
 useEffect(()=>{
  if(!pendingCovers||demoEvents)return;
  return pollWhileVisible(async signal=>{
   const r=await fetch('/api/media/covers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventIds:pendingCovers.split(',')}),cache:'no-store',signal});
   if(!r.ok)return;
   const covers:{eventId:string;cover:MediaRecord|null;media:MediaRecord[]}[]=await r.json();
   if(signal.aborted)return;
   const byEvent=new Map(covers.map(item=>[item.eventId,item]));
   setPage(current=>({...current,items:current.items.map(e=>{if(!byEvent.has(e.id))return e;const update=byEvent.get(e.id)!;const previous=new Map((e.media??[]).map(m=>[m.id,m]));return {...e,cover:update.cover?reusePreview(e.cover,update.cover):null,media:update.media.map(m=>reusePreview(previous.get(m.id),m))};})}));
  });
 },[pendingCovers,demoEvents]);
 const groupedDays=journalDays(page.items);
 const dayTotals=new Map(days.map(day=>[day.date,day.count]));
 const selectedMonth=range&&range.start.endsWith('-01')&&range.end===addDays(addMonths(range.start,1),-1)?range.start.slice(0,7):range?'custom':'';
 const errorNotice=error&&<div className="notice" role="alert">{error.message} <button type="button" disabled={busy} onClick={()=>void load(error.range,error.more)}>重试</button></div>;
 return <div className="journal-feed">
 <section id="journal-filters" className="journal-filter-panel" aria-label="筛选回忆" hidden={!filtersOpen}>
 {(total>0||range)&&<div className="journal-toolbar">
  <p className="journal-total">{range?'这一段时光':'全部回忆'}<span role="status">{busy?'正在读取…':range?`${page.items.length} 段已加载`:`${total} 段珍藏`}</span></p>
  <div className="journal-filters"><label className="sr-only" htmlFor={`${calendarId}-month`}>按月份筛选</label><select id={`${calendarId}-month`} value={selectedMonth} disabled={busy} onChange={event=>{const month=event.target.value;void load(month?{start:month+'-01',end:addDays(addMonths(month+'-01',1),-1)}:undefined);}}><option value="">全部时间</option>{selectedMonth==='custom'&&<option value="custom" disabled>已选日期范围</option>}{[...new Set([...months,...(selectedMonth&&selectedMonth!=='custom'?[selectedMonth]:[])])].sort().reverse().map(month=><option key={month} value={month}>{month.slice(0,4)} 年 {Number(month.slice(5))} 月</option>)}</select>
   <button type="button" className="calendar-toggle" aria-expanded={calendar.open} aria-controls={calendarId} onClick={()=>setCalendar(current=>({open:!current.open,mounted:true}))}>{calendar.open?'收起日历':'按日历查看'}<span aria-hidden="true">{calendar.open?'⌃':'⌄'}</span></button>
  </div>
 </div>}
 <div id={calendarId} className="calendar-panel" hidden={!calendar.open}>
  {calendar.mounted&&<Heatmap key={JSON.stringify(restoredWindow)||'default'} initialWindow={restoredWindow} selection={range??null} today={today} days={days} onSelect={(start,end)=>void load({start,end})} onWindowChange={s=>{view.current=s;}}/>}
 </div>
 {range&&<div className="journal-range"><span>{range.start} — {range.end}</span><button type="button" onClick={()=>void load(undefined)} disabled={busy}>清除日期筛选 ×</button></div>}
 </section>
 {error&&!error.more&&errorNotice}
 <div aria-busy={busy}>{!page.items.length?<section className="panel empty journal-empty"><div className="empty-mark" aria-hidden="true">✦</div><h2>{range?'这一段日子，还没有记录':'第一段回忆，从这里开始'}</h2><p>{range?'换个时间看看，或者补记这段日子的小事。':'第一次伸手、一个小小的笑容，或是今天的心情。'}</p><NewEventButton>记下一刻</NewEventButton></section>:<section className="timeline" aria-label="按发生日期倒序的回忆">{groupedDays.map((day,i)=>{const month=day.date.slice(0,7),heading=month!==groupedDays[i-1]?.date.slice(0,7);return <div key={day.date}>{heading&&<h2 className="chapter"><small>{month.slice(0,4)} 年</small>{Number(month.slice(5))} 月</h2>}<JournalDay day={day} index={i} total={dayTotals.get(day.date)??day.events.length} remember={remember} onMediaChange={media=>setPage(current=>({...current,items:current.items.map(event=>event.id!==media.eventId?event:{...event,media:event.media?.map(item=>item.id===media.id?media:item),cover:event.cover?.id===media.id?media:event.cover})}))}/></div>;})}</section>}</div>
 <div ref={loadMoreTarget} className="timeline-loader">
  {error?(error.more?errorNotice:null):<p role="status">{busy?'正在翻开回忆…':page.next?'继续往下，看看以前的回忆':page.items.length?(range?'这段时光的回忆，都在这里了':'已经到最早的回忆了'):''}</p>}
 </div></div>;
}

'use client';
import Link from 'next/link';
import {Cover} from './media-gallery';
import {ageOn} from '@/domain/dates';
import type {EventRecord} from '@/domain/events';
import type {JournalDay as Day} from '@/domain/journal-days';
import styles from './journal-day.module.css';

function mediaSummary(images:number,videos:number){return [images?`${images} 张照片`:'',videos?`${videos} 段视频`:''].filter(Boolean).join(' · ')||'文字回忆';}
export function JournalDay({day,index,total,remember}:{day:Day;index:number;total:number;remember:(event:EventRecord)=>void}){
 const grouped=day.events.length>1,remaining=Math.max(0,total-day.events.length);
 return <article className={`entry ${index%2?'right':''}`} aria-label={`${day.date}的回忆`}>
  <div className="stamp"><span>{Number(day.date.slice(8))}日</span></div>
  <div className={`memory panel ${styles.day}`}>
   <div className="card-top"><small>{day.authors.join('、')}记录{grouped?` · ${day.events.length} 次`:''}</small><span className="age">{ageOn(day.date)}</span></div>
   <div className={styles.records}>
    {day.events.map((event,i)=><section id={`event-${event.id}`} key={event.id} className={styles.record} aria-label={`${event.author}的第${i+1}段回忆`}>
     {grouped&&day.authors.length>1&&<small className={styles.author}>{event.author}记录</small>}
     {event.title.trim()&&<h2><Link href={`/events/${event.id}`} onClick={()=>remember(event)}>{event.title}</Link></h2>}
     {event.mediaCount>0&&<Link className="cover-link" href={`/events/${event.id}`} onClick={()=>remember(event)} aria-label={`查看${day.date}第${i+1}次记录的照片和视频`}><Cover media={event.cover} priority={index===0&&i===0}/></Link>}
     {(event.body||event.feeling)&&<p className="excerpt">{event.body||event.feeling}</p>}
     {grouped&&<div className={styles.recordBottom}><span>{mediaSummary(event.imageCount,event.videoCount)}</span><Link href={`/events/${event.id}`} onClick={()=>remember(event)}>回看这次记录 →</Link></div>}
    </section>)}
   </div>
   <div className="card-bottom"><span className="muted">{remaining?'已加载：':''}{mediaSummary(day.imageCount,day.videoCount)}</span>{!grouped&&<Link href={`/events/${day.events[0].id}`} onClick={()=>remember(day.events[0])}>慢慢回看 →</Link>}</div>
   {remaining>0&&<p className={styles.remaining}>这一天还有 {remaining} 次记录，继续向下加载可一起查看。</p>}
  </div>
 </article>;
}

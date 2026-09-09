'use client';
import Link from 'next/link';
import {useState} from 'react';
import {MediaView} from './media-gallery';
import {MediaViewer} from './media-viewer';
import {ageOn} from '@/domain/dates';
import type {EventRecord} from '@/domain/events';
import type {MediaRecord} from '@/domain/media';
import {journalDayContent,type JournalDay as Day} from '@/domain/journal-days';
import styles from './journal-day.module.css';

export function JournalDay({day,index,total,remember}:{day:Day;index:number;total:number;remember:(event:EventRecord)=>void}){
 const remaining=Math.max(0,total-day.events.length),content=journalDayContent(day);
 const [selected,setSelected]=useState<string|null>(null);
 const allMedia=[...content.images,...content.videos];
 function gallery(items:MediaRecord[],kind:'照片'|'视频'){
  if(!items.length)return null;
  return <section className={styles.section} aria-label={`${day.date}的${kind}`}>
   <h3>{kind}<span>{items.length}</span></h3>
   <div className={styles.grid}>{items.map((media,i)=><button key={media.id} type="button" className={styles.thumbnail} aria-label={`查看${kind}：${media.filename}`} onClick={()=>setSelected(media.id)}>
    <MediaView media={media} compact thumbnail priority={index===0&&i<3}/>
   </button>)}</div>
  </section>;
 }
 return <>
  <article className={`entry ${index%2?'right':''}`} aria-label={`${day.date}的回忆`}>
   <div className="stamp"><span>{Number(day.date.slice(8))}日</span></div>
   <div className={`memory panel ${styles.day}`}>
    {day.events.map(event=><span className={styles.anchor} id={`event-${event.id}`} key={event.id}/>)}
    <div className="card-top"><small>{day.authors.join('、')}记录</small><span className="age">{ageOn(day.date)}</span></div>
    <div className={styles.counts} aria-label="当天素材数量">
     {day.imageCount>0&&<span><strong>{day.imageCount}</strong> 张照片</span>}
     {day.videoCount>0&&<span><strong>{day.videoCount}</strong> 段视频</span>}
     {content.texts.length>0&&<span><strong>{content.texts.length}</strong> 段文字</span>}
    </div>
    {content.texts.length>0&&<section className={styles.section} aria-label={`${day.date}的文字`}><h3>文字<span>{content.texts.length}</span></h3>
     {content.texts.map(event=><div className={styles.text} key={event.id}>
      {event.title.trim()&&<h4>{event.title}</h4>}
      {event.body&&<p>{event.body}</p>}{event.feeling&&<blockquote>{event.feeling}</blockquote>}
      <Link href={`/events/${event.id}`} onClick={()=>remember(event)}>{event.author} · 查看记录 →</Link>
     </div>)}
    </section>}
    {gallery(content.images,'照片')}
    {gallery(content.videos,'视频')}
    {remaining>0&&<p className={styles.remaining}>这一天还有 {remaining} 次记录，继续向下加载可一起查看。</p>}
   </div>
  </article>
  {selected&&<MediaViewer items={allMedia} selectedId={selected} date={day.date} onSelect={setSelected} onClose={()=>setSelected(null)} onRemember={media=>{const event=day.events.find(e=>e.id===media.eventId);if(event)remember(event);}}/>}
 </>;
}

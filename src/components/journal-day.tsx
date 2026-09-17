'use client';
import {useEffect,useState} from 'react';
import {MediaView} from './media-gallery';
import {MediaViewer} from './media-viewer';
import {sortByCaptureTime} from '@/domain/capture-date';
import {AgeCounter} from './age-counter';
import type {EventRecord} from '@/domain/events';
import type {MediaRecord} from '@/domain/media';
import {journalDayContent,type JournalDay as Day} from '@/domain/journal-days';
import type {DayMedia} from '@/server/media-store';
import styles from './journal-day.module.css';

function mergeMedia(current:MediaRecord[],incoming:MediaRecord[]){
 const all=new Map(current.map(media=>[media.id,media]));for(const media of incoming)all.set(media.id,media);return sortByCaptureTime([...all.values()]);
}
const TEXT_COLLAPSED_LIMIT=2;
const TEXT_PREVIEW_LIMIT=320;
function textContent(event:EventRecord){
 return [event.body,event.feeling].map(value=>value.trim()).filter(Boolean).join('\n');
}
function textPreview(event:EventRecord,expanded:boolean){
 const text=textContent(event);
 return !expanded&&text.length>TEXT_PREVIEW_LIMIT?`${text.slice(0,TEXT_PREVIEW_LIMIT)}…`:text;
}
function textHeading(day:Day,events:EventRecord[]){
 if(events.length===1)return `${events[0].author}记了一笔`;
 return `${day.authors.join('、')}写下的事`;
}
export function JournalDay({day,index,total,initialMedia,onMediaChange}:{day:Day;index:number;total:number;initialMedia:DayMedia;onMediaChange:(media:MediaRecord)=>void}){
 const remaining=Math.max(0,total-day.events.length),content=journalDayContent(day);
 const [selected,setSelected]=useState<string|null>(null);
 const initialKey=`${day.date}:${initialMedia.total}:${initialMedia.items.map(media=>media.id).join(',')}`;
 const [previousInitial,setPreviousInitial]=useState(initialKey),[media,setMedia]=useState(initialMedia.items),[expanded,setExpanded]=useState(false),[textsExpanded,setTextsExpanded]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [wallColumns,setWallColumns]=useState(3);
 if(previousInitial!==initialKey){setPreviousInitial(initialKey);setMedia(initialMedia.items);setExpanded(false);setTextsExpanded(false);setLoading(false);setError('');}
 useEffect(()=>{
  if(typeof window==='undefined')return;
  const query=window.matchMedia('(max-width: 1023px)');
  const update=()=>setWallColumns(query.matches?2:3);
  update();query.addEventListener('change',update);
  return()=>query.removeEventListener('change',update);
 },[]);
 const allMedia=sortByCaptureTime(media);
 const collapsedLimit=wallColumns*2;
 const visibleMedia=expanded?allMedia:allMedia.slice(0,collapsedLimit);
 const moreMediaCount=Math.max(0,initialMedia.total-visibleMedia.length);
 const textsNeedExpansion=content.texts.length>TEXT_COLLAPSED_LIMIT||content.texts.some(event=>textContent(event).length>TEXT_PREVIEW_LIMIT);
 const visibleTexts=textsExpanded||!textsNeedExpansion?content.texts:content.texts.slice(0,TEXT_COLLAPSED_LIMIT);
 const moreTextCount=Math.max(0,content.texts.length-visibleTexts.length);
 async function expand(){
  if(loading)return;setLoading(true);setError('');let offset=media.length;
  try{
   while(offset<initialMedia.total){
    const response=await fetch(`/api/journal-days/${day.date}/media?offset=${offset}`,{cache:'no-store'});
    if(!response.ok)throw Error(response.status===401?'登录已过期，请重新登录':'暂时无法展开这一天的素材，请重试');
    const next:DayMedia=await response.json();
    if(!next.items.length&&next.nextOffset!==null)throw Error('暂时无法展开这一天的素材，请重试');
    setMedia(current=>mergeMedia(current,next.items));
    offset=next.nextOffset??next.total;
   }
   setExpanded(true);
  }catch(cause){setError((cause as Error).message);}finally{setLoading(false);}
 }
 return <>
  <article className={`entry ${index%2?'right':''}`} aria-label={`${day.date}的回忆`}>
   <div className={`stamp ${styles.dateStamp}`}><time dateTime={day.date}>{Number(day.date.slice(8))}日</time><AgeCounter date={day.date} subtle/></div>
   <div className={`memory panel ${styles.day}`}>
    {day.events.map(event=><span className={styles.anchor} id={`event-${event.id}`} key={event.id}/>)}
    <div className={styles.dayMeta} aria-label="当天记录与素材数量">
     <small className={styles.authors}>{day.authors.map(author=><span key={author}>{author}记录</span>)}</small>
     <div className={styles.counts} aria-label="当天素材数量">
      {day.imageCount>0&&<span><strong>{day.imageCount}</strong> 张照片</span>}
      {day.videoCount>0&&<span><strong>{day.videoCount}</strong> 段视频</span>}
      {content.texts.length>0&&<span><strong>{content.texts.length}</strong> 段文字</span>}
     </div>
    </div>
    {content.texts.length>0&&<section className={styles.section} aria-label={`${day.date}的文字`}><h3>{textHeading(day,content.texts)}<span>{content.texts.length>1?`${content.texts.length} 条`:''}</span></h3>
     {visibleTexts.map(event=>{const preview=textPreview(event,textsExpanded);return <div className={styles.text} key={event.id}>
      <div className={styles.textMeta}><span>{event.author}</span>{event.title.trim()&&<h4>{event.title}</h4>}</div>
      {preview&&<p>{preview}</p>}
     </div>;})}
     {!textsExpanded&&textsNeedExpansion&&<div className={styles.expand}><button type="button" onClick={()=>setTextsExpanded(true)}>{moreTextCount>0?`更多（还有 ${moreTextCount} 条）`:'更多'}</button></div>}
    </section>}
    {allMedia.length>0&&<section className={styles.section} aria-label={`${day.date}的照片与视频`}>
     <div className={styles.mediaHeading}><h3>这一天的画面<span>· {initialMedia.total}</span></h3></div>
     <div className={styles.wall}>{visibleMedia.map((item,i)=>{const uploader=item.uploader;return <button key={item.id} type="button" className={styles.thumbnail} data-kind={item.kind} data-state={item.status} aria-label={`查看${item.kind==='video'?'视频':'照片'}：${item.filename}${uploader?`，${uploader}录制`:''}${item.needsTimeReview?'，待修改时间':''}`} onClick={()=>setSelected(item.id)}>
      <MediaView media={item} compact thumbnail priority={index===0&&i<3}/>
      {uploader&&<span className={styles.mediaAuthor} data-author={uploader} aria-hidden="true"/>}
     </button>;})}</div>
     {!expanded&&moreMediaCount>0&&<div className={styles.expand}><button type="button" disabled={loading} onClick={()=>void expand()}>{loading?`正在展开 ${initialMedia.total} 份素材…`:`展示更多（还有 ${moreMediaCount} 份）`}</button>{error&&<p role="alert">{error}</p>}</div>}
    </section>}
    {remaining>0&&<p className={styles.remaining}>这一天还有 {remaining} 次记录，继续向下加载可一起查看。</p>}
   </div>
  </article>
  {selected&&<MediaViewer items={allMedia} selectedId={selected} date={day.date} onSelect={setSelected} onClose={()=>setSelected(null)} onMediaChange={updated=>{setMedia(current=>current.map(item=>item.id===updated.id?updated:item));onMediaChange(updated);}}/>}
 </>;
}

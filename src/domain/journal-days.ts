import {sortByCaptureTime} from './capture-date';
import type {MediaRecord} from './media';
import type {EventRecord} from './events';

export type JournalDay={date:string;events:EventRecord[];imageCount:number;videoCount:number;authors:string[]};
// Group by the chosen occurrence date, never the later upload/creation timestamp.
// Rebuild from all loaded pages so a day split across pages joins the same card.
export function journalDays(items:EventRecord[]):JournalDay[]{
 const groups=new Map<string,JournalDay>();
 const unique=new Map(items.map(event=>[event.id,event]));
 for(const event of unique.values()){
  let day=groups.get(event.occurredOn);
  if(!day){day={date:event.occurredOn,events:[],imageCount:0,videoCount:0,authors:[]};groups.set(day.date,day);}
  day.events.push(event);day.imageCount+=event.imageCount;day.videoCount+=event.videoCount;
  if(!day.authors.includes(event.author))day.authors.push(event.author);
 }
 return [...groups.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

// Flatten across uploads for the day; retain each media's owning event for edits.
export function journalDayContent(day:JournalDay){
 const media=sortByCaptureTime([...new Map(day.events.flatMap(e=>e.media??(e.cover?[e.cover]:[])).map(m=>[m.id,m])).values()]);
 return {texts:day.events.filter(e=>e.title.trim()||e.body.trim()||e.feeling.trim()),images:media.filter(m=>m.kind==='image'),videos:media.filter(m=>m.kind==='video')} satisfies {texts:EventRecord[];images:MediaRecord[];videos:MediaRecord[]};
}

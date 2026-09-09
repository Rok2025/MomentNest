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

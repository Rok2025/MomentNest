import { BIRTHDAY, isCalendarDate } from './dates';
export type Grain='day'|'week'|'month';
export type WindowState={grain:Grain;focus:string;start:string;end:string};
export type DayCount={date:string;count:number};
export type HeatCell={start:string;end:string;count:number};
export function addDays(date:string,n:number){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function addMonths(date:string,n:number){const d=new Date(date+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));return d.toISOString().slice(0,10);}
export function yearWindow(year:number,today:string):WindowState{return {grain:'day',focus:year===Number(today.slice(0,4))?today:`${year}-07-01`,start:`${year}-01-01`,end:`${year}-12-31`};}
export function allWindow(today:string):WindowState{return {grain:'month',focus:today,start:BIRTHDAY.slice(0,4)+'-01-01',end:today.slice(0,4)+'-12-31'};}
export function changeGrain(s:WindowState,grain:Grain,today:string):WindowState{
 if(grain==='month')return {...allWindow(today),focus:s.focus};
 const half=grain==='day'?6:12;let start=addMonths(s.focus.slice(0,7)+'-01',-half),end=addDays(addMonths(start,half*2),-1);
 const min=BIRTHDAY.slice(0,4)+'-01-01',max=today.slice(0,4)+'-12-31';
 if(start<min){start=min;end=addDays(addMonths(start,half*2),-1);}if(end>max){end=max;start=addMonths(addDays(end,1),-half*2);}if(start<min)start=min;
 return {grain,focus:s.focus,start,end};
}
export function moveWindow(s:WindowState,direction:-1|1,today:string):WindowState{
 if(s.grain==='month')return s;
 const months=s.grain==='day'?6:12,lo=BIRTHDAY.slice(0,4)+'-01-01',hi=today.slice(0,4)+'-12-31';
 let start=addMonths(s.start,direction*months),end=addDays(addMonths(addDays(s.end,1),direction*months),-1);
 if(start<lo||end>hi)return s;
 start=start<lo?lo:start;end=end>hi?hi:end;let focus=addMonths(s.focus,direction*months);if(focus<start)focus=start;if(focus>end)focus=end;
 return {...s,start,end,focus};
}
export function cellsFor(s:WindowState,days:DayCount[]):HeatCell[]{
 if(!isCalendarDate(s.start)||!isCalendarDate(s.end)||s.end<s.start)throw Error('Invalid window');
 const counts=new Map(days.map(d=>[d.date,d.count]));const cells:HeatCell[]=[];
 for(let start=s.start;start<=s.end;){
  let next=addDays(start,1);
  if(s.grain==='week'){const dow=new Date(start+'T00:00:00Z').getUTCDay();next=addDays(start,7-((dow+6)%7));}
  if(s.grain==='month')next=addMonths(start.slice(0,7)+'-01',1);
  const end=addDays(next,-1)<s.end?addDays(next,-1):s.end;let count=0;
  for(let d=start;d<=end;d=addDays(d,1))count+=counts.get(d)||0;
  cells.push({start,end,count});start=next;
 }
 return cells;
}

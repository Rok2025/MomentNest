import { memberFor, type Queryable } from './event-store';
import type { DayCount } from '../domain/heatmap';
export async function heatmapCounts(db:Queryable,authId:string){
 const m=await memberFor(db,authId);
 const {rows}=await db.query('select occurred_on::text as date,count(*)::int as count from momentnest.events where household_id=$1 group by occurred_on order by occurred_on',[m.householdId]);
 return rows.map(r=>({date:String(r.date),count:Number(r.count)})) as DayCount[];
}

import {randomUUID} from 'node:crypto';
import {DomainError,type Member} from '../domain/events';
import type {Queryable} from './event-store';

export type UploadGroup={eventId:string;uploads:Record<string,unknown>[];offset:number};
// Called inside saveEvent's transaction, after lockUploads has checked ownership,
// verification, expiry and locked every upload. All dates share three writes.
export async function bindUploadGroups(db:Queryable,m:Member,groups:UploadGroup[]){
 const bindings=groups.flatMap(g=>g.uploads.map((u,i)=>({id:randomUUID(),uploadId:String(u.id),eventId:g.eventId,position:g.offset+i})));
 if(!bindings.length)return;
 const ids=bindings.map(b=>b.id),uploads=bindings.map(b=>b.uploadId),events=bindings.map(b=>b.eventId);
 const inserted=await db.query(`insert into momentnest.media(id,household_id,event_id,upload_session_id,object_key,filename,kind,mime,size,sha256,position)
  select b.id,$1,b.event_id,u.id,u.object_key,u.filename,u.kind,u.mime,u.expected_size,u.sha256,b.position
  from unnest($3::uuid[],$4::uuid[],$5::uuid[],$6::int[]) as b(id,upload_id,event_id,position)
  join momentnest.upload_sessions u on u.id=b.upload_id
  where u.household_id=$1 and u.member_id=$2 and u.state='verified' returning id`,
  [m.householdId,m.id,ids,uploads,events,bindings.map(b=>b.position)]);
 if(inserted.rows.length!==bindings.length)throw new DomainError('VALIDATION','部分素材已失效，请重新确认后保存');
 await db.query('insert into momentnest.media_jobs(media_id) select unnest($1::uuid[])',[ids]);
 const bound=await db.query(`update momentnest.upload_sessions u set state='bound',event_id=b.event_id
  from unnest($3::uuid[],$4::uuid[]) as b(upload_id,event_id)
  where u.id=b.upload_id and u.household_id=$1 and u.member_id=$2 and u.state='verified' returning u.id`,[m.householdId,m.id,uploads,events]);
 if(bound.rows.length!==bindings.length)throw new DomainError('VALIDATION','部分素材绑定失败，请重试确认保存');
}

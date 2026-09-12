import { randomUUID } from 'node:crypto';
import { DomainError,type Member } from '../domain/events';
import { fileKind,fileProblem,MAX_FILES,type MediaRecord } from '../domain/media';
import { memberFor,type Queryable,type Transaction } from './event-store';
import { previewLinks,playbackLink } from './media-preview';
import { coverJoin,mediaList } from './media-query';
import {TEMP_UPLOAD_BYTES} from '../domain/upload-draft';
import {captureTimeInput,effectiveCaptureTime} from '../domain/media-capture-time';
export async function authorizeUploads(tx:Transaction,authId:string,files:{name:string;size:number}[]){
 if(!files.length||files.length>MAX_FILES)throw new DomainError('VALIDATION',`每批请选择1至${MAX_FILES}份素材`);
 for(const file of files){const problem=fileProblem(file.name,file.size);if(problem||file.name.length>255)throw new DomainError('VALIDATION',problem||'文件名过长');}
 return tx(async db=>{
  const m=await memberFor(db,authId);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`uploads:${m.id}`]);
  const ids=files.map(()=>randomUUID());
  // One insert for the whole selection; the member lock keeps the temporary byte budget atomic.
  const r=await db.query(`insert into momentnest.upload_sessions(id,household_id,member_id,object_key,filename,kind,expected_size,batch_id)
   select f.id,$1,$2,f.key,f.name,f.kind,f.size,$10::uuid
   from unnest($3::uuid[],$4::text[],$5::text[],$6::text[],$7::bigint[]) as f(id,key,name,kind,size)
   where (select coalesce(sum(expected_size),0) from momentnest.upload_sessions where member_id=$2 and state in ('authorized','verified') and expires_at>clock_timestamp())+$8<=$9 returning *`,
   [m.householdId,m.id,ids,ids.map(id=>`originals/${m.householdId}/${id}.bin`),files.map(f=>f.name),files.map(f=>fileKind(f.name)),files.map(f=>f.size),files.reduce((n,f)=>n+f.size,0),TEMP_UPLOAD_BYTES,randomUUID()]);
  if(r.rows.length!==files.length)throw new DomainError('VALIDATION','未保存素材已接近10 GB，请在草稿列表中保存或放弃旧素材后继续');
  return ids.map(id=>r.rows.find(row=>row.id===id)!);
 });
}
export async function authorizeUpload(tx:Transaction,authId:string,input:{name:string;size:number;id?:string}){
 if(!input.id)return (await authorizeUploads(tx,authId,[input]))[0];
 const problem=fileProblem(input.name,input.size);if(problem||input.name.length>255)throw new DomainError('VALIDATION',problem||'文件名过长');
 return tx(async db=>{
  const m=await memberFor(db,authId);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`uploads:${m.id}`]);
  const r=await db.query("select *,archive_date::text as archive_date from momentnest.upload_sessions where id=$1 and household_id=$2 and member_id=$3 and state in ('authorized','verified') and expires_at>clock_timestamp()+interval '1 minute'",[input.id,m.householdId,m.id]);
  const row=r.rows[0];if(!row||row.filename!==input.name||Number(row.expected_size)!==input.size)throw new DomainError('VALIDATION','上传已取消或过期，请移除后重新选择文件');return row;
 });
}
export async function ownUpload(db:Queryable,authId:string,id:string){const m=await memberFor(db,authId);const r=await db.query('select *,archive_date::text as archive_date from momentnest.upload_sessions where id=$1 and household_id=$2 and member_id=$3',[id,m.householdId,m.id]);if(!r.rows[0])throw new DomainError('NOT_FOUND','没有找到这份上传');return r.rows[0];}
export async function completeUpload(tx:Transaction,authId:string,id:string,evidence:{sha256:string;size:number;kind:string;mime:string}){
 return tx(async db=>{const m=await memberFor(db,authId);const r=await db.query('select *,archive_date::text as archive_date from momentnest.upload_sessions where id=$1 and household_id=$2 and member_id=$3 for update',[id,m.householdId,m.id]);const u=r.rows[0];
  if(!u||!['authorized','verified'].includes(String(u.state))||new Date(String(u.expires_at)).valueOf()<=Date.now())throw new DomainError('VALIDATION','上传已失效，请重新选择文件');
  if(evidence.size!==Number(u.expected_size)||evidence.kind!==u.kind||!/^[a-f0-9]{64}$/.test(evidence.sha256))throw new DomainError('VALIDATION','原件格式或大小校验失败');
  if(u.client_sha256&&u.client_sha256!==evidence.sha256)throw new DomainError('VALIDATION','文件内容与选择时不一致，请移除后重新选择');
  if(u.sha256&&u.sha256!==evidence.sha256)throw new DomainError('VALIDATION','原件校验值发生变化');
  await db.query("update momentnest.upload_sessions set state='verified',sha256=$1,mime=$2 where id=$3",[evidence.sha256,evidence.mime,id]);return {id,verified:true};
 });
}
export async function cancelUpload(tx:Transaction,authId:string,id:string){return tx(async db=>{const m=await memberFor(db,authId);await db.query("update momentnest.upload_sessions set state='cancelled',expires_at=clock_timestamp()+interval '1 hour' where id=$1 and household_id=$2 and member_id=$3 and state in ('authorized','verified')",[id,m.householdId,m.id]);});}
export async function lockUploads(db:Queryable,m:Member,ids:string[]){
 if(new Set(ids).size!==ids.length||ids.length>MAX_FILES)throw new DomainError('VALIDATION',`所选文件重复或数量超过${MAX_FILES}份`);
 if(!ids.length)return [];
 await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`media-content:${m.householdId}`]);
 const {rows}=await db.query('select * from momentnest.upload_sessions where id=any($1::uuid[]) order by id for update',[ids]);
 if(rows.length!==ids.length||rows.some(u=>u.household_id!==m.householdId||u.member_id!==m.id||u.state!=='verified'||new Date(String(u.expires_at)).valueOf()<=Date.now()))throw new DomainError('VALIDATION','部分素材未验证、已失效或不属于当前账号，请重新上传');
 const hashes=rows.map(u=>`${u.sha256}:${u.expected_size}`);
 if(new Set(hashes).size!==hashes.length)throw new DomainError('VALIDATION','本批包含内容完全相同的素材，请移除重复项后保存');
 const saved=await db.query('select m.id from momentnest.media m join momentnest.upload_sessions source on source.id=m.upload_session_id join momentnest.upload_sessions u on (m.sha256=u.sha256 and m.size=u.expected_size) or (source.sha256=u.sha256 and source.expected_size=u.expected_size) where m.household_id=$1 and u.id=any($2::uuid[]) limit 1',[m.householdId,ids]);
 if(saved.rows.length)throw new DomainError('CONFLICT','部分素材已收录，请重新校验素材，跳过重复项后保存');
 return ids.map(id=>rows.find(u=>u.id===id)!);
}
export async function bindUploads(db:Queryable,m:Member,eventId:string,uploads:Record<string,unknown>[],offset:number){
 for(const [i,u] of uploads.entries()){
  const id=randomUUID();await db.query('insert into momentnest.media(id,household_id,event_id,upload_session_id,object_key,filename,kind,mime,size,sha256,position) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,m.householdId,eventId,u.id,u.object_key,u.filename,u.kind,u.mime,u.expected_size,u.sha256,offset+i]);
  await db.query('insert into momentnest.media_jobs(media_id) values($1)',[id]);await db.query("update momentnest.upload_sessions set state='bound',event_id=$1 where id=$2",[eventId,u.id]);
 }
}
export function mediaRecord(r:Record<string,unknown>,withPreviewLinks=false):MediaRecord{return {id:String(r.id),eventId:String(r.event_id),filename:String(r.filename),kind:r.kind as MediaRecord['kind'],mime:String(r.mime),size:Number(r.size),position:Number(r.position),status:r.status as MediaRecord['status'],needsTimeReview:r.needs_time_review===true,...effectiveCaptureTime(r),errorCode:r.error_code?String(r.error_code):null,hasPreview:!!r.preview_key,hasPlayback:!!r.playback_key,...(withPreviewLinks?{preview:previewLinks(r),playback:playbackLink(r)}:{})};}
export async function updateMediaCaptureTime(tx:Transaction,authId:string,id:string,raw:unknown){
 const input=captureTimeInput.parse(raw);
 return tx(async db=>{
  const media=await ownMedia(db,authId,id);
  const {rows}=await db.query(`update momentnest.media set capture_time_override=$1
   where household_id=$2 and id=$3 and capture_time_override is not distinct from $4::text returning *`,
   [input.capturedTime,media.household_id,id,input.expectedOverride]);
  if(!rows.length)throw new DomainError('CONFLICT','这份文件的时间已被修改，请关闭编辑后重新打开查看最新时间');
  return mediaRecord(rows[0]);
 });
}
export async function listMedia(db:Queryable,authId:string,eventId:string,withPreviewLinks=false){const m=await memberFor(db,authId);return (await db.query('select * from momentnest.media where household_id=$1 and event_id=$2 order by position',[m.householdId,eventId])).rows.map(r=>mediaRecord(r,withPreviewLinks));}
// Used by the feed query and by one batched refresh for unfinished covers.
export async function listEventCovers(db:Queryable,authId:string,eventIds:string[],withPreviewLinks=false){
 const m=await memberFor(db,authId);
 const {rows}=await db.query(`select e.id,to_jsonb(cover) as cover,${mediaList} as media from momentnest.events e ${coverJoin} where e.household_id=$1 and e.id=any($2::uuid[])`,[m.householdId,eventIds]);
 return rows.map(r=>({eventId:String(r.id),media:((r.media||[]) as Record<string,unknown>[]).map(m=>mediaRecord(m,withPreviewLinks)),cover:r.cover?mediaRecord(r.cover as Record<string,unknown>,withPreviewLinks):null}));
}
export async function ownMedia(db:Queryable,authId:string,id:string){const m=await memberFor(db,authId);const r=await db.query('select * from momentnest.media where household_id=$1 and id=$2',[m.householdId,id]);if(!r.rows[0])throw new DomainError('NOT_FOUND','找不到这份素材');return r.rows[0];}
export async function retryMedia(tx:Transaction,authId:string,id:string){return tx(async db=>{
 const media=await ownMedia(db,authId,id);const r=await db.query("update momentnest.media_jobs set state='pending',attempts=0,generation=generation+1,available_at=clock_timestamp(),claim_token=null,lease_until=null where media_id=$1 and state='failed' returning media_id",[media.id]);
 if(r.rows.length)await db.query("update momentnest.media set status='pending',error_code=null where id=$1",[media.id]);return {ok:true};
});}

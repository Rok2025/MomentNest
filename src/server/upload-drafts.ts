import {randomUUID} from 'node:crypto';
import {DomainError} from '../domain/events';
import {fileKind,fileProblem,MAX_FILES} from '../domain/media';
import {TEMP_UPLOAD_BYTES,type DraftFile,type DraftBatch,type DuplicateMedia} from '../domain/upload-draft';
import {memberFor,type Transaction,type Queryable} from './event-store';

export async function savedDuplicate(db:Queryable,householdId:string,sha:string,size:number):Promise<DuplicateMedia|null>{
 const {rows}=await db.query(`select m.event_id,e.occurred_on::text as occurred_on from momentnest.media m join momentnest.events e on e.id=m.event_id where m.household_id=$1 and m.sha256=$2 and m.size=$3 order by m.created_at,m.id limit 1`,[householdId,sha,size]);
 return rows[0]?{eventId:String(rows[0].event_id),occurredOn:String(rows[0].occurred_on)}:null;
}
export type DraftSelection={name:string;size:number;sha256:string;requestKey:string;batchId:string;lastModified?:number};
export async function authorizeDraft(tx:Transaction,authId:string,input:DraftSelection){
 const problem=fileProblem(input.name,input.size);if(problem)throw new DomainError('VALIDATION',problem);
 return tx(async db=>{
  const m=await memberFor(db,authId);
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`uploads:${m.id}`]);
  const duplicate=await savedDuplicate(db,m.householdId,input.sha256,input.size);
  if(duplicate)return {duplicate};
  const prior=(await db.query('select *,archive_date::text as archive_date from momentnest.upload_sessions where member_id=$1 and request_key=$2 for update',[m.id,input.requestKey])).rows[0];
  if(prior&&(prior.client_sha256!==input.sha256||Number(prior.expected_size)!==input.size))throw new DomainError('CONFLICT','本次文件已变化，请重新选择');
  if(prior&&(!['authorized','verified'].includes(String(prior.state))||new Date(String(prior.expires_at)).valueOf()<=Date.now()))throw new DomainError('VALIDATION','此上传已保存、放弃或过期，请移除后重新选择');
  const existing=prior||(await db.query(`select *,archive_date::text as archive_date from momentnest.upload_sessions where member_id=$1 and household_id=$2 and expected_size=$3 and state in ('authorized','verified') and expires_at>clock_timestamp() and (sha256=$4 or (state='authorized' and client_sha256=$4)) order by (state='verified') desc,created_at limit 1 for update`,[m.id,m.householdId,input.size,input.sha256])).rows[0];
  if(existing)return {upload:existing,reused:true};
  const used=(await db.query("select coalesce(sum(expected_size),0)::text as bytes from momentnest.upload_sessions where member_id=$1 and state in ('authorized','verified') and expires_at>clock_timestamp()",[m.id])).rows[0];
  if(Number(used.bytes)+input.size>TEMP_UPLOAD_BYTES)throw new DomainError('VALIDATION','未保存素材已接近10 GB，请在草稿列表中保存或放弃旧素材后继续');
  const id=randomUUID();
  const {rows}=await db.query(`insert into momentnest.upload_sessions(id,household_id,member_id,object_key,filename,kind,expected_size,batch_id,request_key,client_sha256,last_modified) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *,archive_date::text as archive_date`,[id,m.householdId,m.id,`originals/${m.householdId}/${id}.bin`,input.name,fileKind(input.name),input.size,input.batchId,input.requestKey,input.sha256,input.lastModified??null]);
  return {upload:rows[0],reused:false};
 });
}
export async function draftBatches(db:Queryable,authId:string):Promise<DraftBatch[]>{
 const m=await memberFor(db,authId);
 const {rows}=await db.query(`select coalesce(batch_id,id) as id,count(*)::int as count,count(*) filter(where state='verified')::int as verified,sum(expected_size)::text as size,min(created_at) as created_at,min(expires_at) as expires_at from momentnest.upload_sessions where member_id=$1 and household_id=$2 and state in ('authorized','verified') and expires_at>clock_timestamp() group by coalesce(batch_id,id) order by min(created_at) desc`,[m.id,m.householdId]);
 return rows.map(r=>({id:String(r.id),count:Number(r.count),verified:Number(r.verified),size:Number(r.size),createdAt:new Date(String(r.created_at)).toISOString(),expiresAt:new Date(String(r.expires_at)).toISOString()}));
}
export async function draftFiles(db:Queryable,authId:string,batchId:string):Promise<DraftFile[]>{
 const m=await memberFor(db,authId);
 const {rows}=await db.query("select *,archive_date::text as archive_date from momentnest.upload_sessions where member_id=$1 and household_id=$2 and coalesce(batch_id,id)=$3 and state in ('authorized','verified') and expires_at>clock_timestamp() order by (state='verified') desc,created_at,id limit $4",[m.id,m.householdId,batchId,MAX_FILES]);
 return rows.map(r=>({id:String(r.id),name:String(r.filename),size:Number(r.expected_size),kind:String(r.kind),state:String(r.state),sha256:r.sha256?String(r.sha256):null,clientSha256:r.client_sha256?String(r.client_sha256):null,lastModified:r.last_modified===null?null:Number(r.last_modified),archiveDate:r.archive_date?String(r.archive_date).slice(0,10):null,expiresAt:new Date(String(r.expires_at)).toISOString()}));
}
export async function discardDraft(tx:Transaction,authId:string,batchId:string){return tx(async db=>{
 const m=await memberFor(db,authId);
 await db.query("update momentnest.upload_sessions set state='cancelled',expires_at=clock_timestamp()+interval '1 hour' where member_id=$1 and household_id=$2 and coalesce(batch_id,id)=$3 and state in ('authorized','verified')",[m.id,m.householdId,batchId]);
});}
export async function draftDate(tx:Transaction,authId:string,id:string,date:string|null){return tx(async db=>{
 const m=await memberFor(db,authId);
 const {rows}=await db.query("update momentnest.upload_sessions set archive_date=$1 where id=$2 and member_id=$3 and household_id=$4 and state in ('authorized','verified') and expires_at>clock_timestamp() returning id",[date,id,m.id,m.householdId]);
 if(!rows.length)throw new DomainError('VALIDATION','草稿已保存、过期或放弃，请刷新草稿列表');
});}

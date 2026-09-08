import { randomUUID } from 'node:crypto';
import type { Transaction,Queryable } from './event-store';
export type Job={mediaId:string;token:string;generation:number;attempts:number;key:string;kind:string;sha256:string};
export async function claimJob(tx:Transaction):Promise<Job|null>{return tx(async db=>{
 const {rows}=await db.query("select j.*,m.object_key,m.kind,m.sha256 from momentnest.media_jobs j join momentnest.media m on m.id=j.media_id where (j.state='pending' and j.available_at<=clock_timestamp()) or (j.state='processing' and j.lease_until<clock_timestamp()) order by j.available_at limit 1 for update of j skip locked");
 const r=rows[0];if(!r)return null;const token=randomUUID();
 // An expired last attempt becomes visibly failed instead of retrying forever.
 if(Number(r.attempts)>=3){await db.query("update momentnest.media_jobs set state='failed',claim_token=null where media_id=$1",[r.media_id]);await db.query("update momentnest.media set status='failed',error_code='PROCESSING_FAILED' where id=$1",[r.media_id]);return null;}
 await db.query("update momentnest.media_jobs set state='processing',claim_token=$1,attempts=attempts+1,lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where media_id=$2",[token,r.media_id]);await db.query("update momentnest.media set status='processing',error_code=null where id=$1",[r.media_id]);
 return {mediaId:String(r.media_id),token,generation:Number(r.generation),attempts:Number(r.attempts)+1,key:String(r.object_key),kind:String(r.kind),sha256:String(r.sha256)};
});}
export async function heartbeat(db:Queryable,j:Job){const r=await db.query("update momentnest.media_jobs set lease_until=clock_timestamp()+interval '90 seconds' where media_id=$1 and claim_token=$2 and generation=$3 and state='processing' returning media_id",[j.mediaId,j.token,j.generation]);return r.rows.length===1;}
export type Processed={previewKey:string;playbackKey:string|null;capturedText:string|null;capturedZone:string|null;metadata:Record<string,unknown>};
export async function finishJob(tx:Transaction,j:Job,result:Processed|null){return tx(async db=>{
 const r=await db.query("select media_id from momentnest.media_jobs where media_id=$1 and claim_token=$2 and generation=$3 and state='processing' and lease_until>clock_timestamp() for update",[j.mediaId,j.token,j.generation]);if(!r.rows.length)return false;
 if(result){await db.query("update momentnest.media set status='ready',preview_key=$1,playback_key=$2,captured_text=$3,captured_zone=$4,metadata=$5,error_code=null where id=$6",[result.previewKey,result.playbackKey,result.capturedText,result.capturedZone,JSON.stringify(result.metadata),j.mediaId]);await db.query("update momentnest.media_jobs set state='ready',lease_until=null,claim_token=null,updated_at=clock_timestamp() where media_id=$1",[j.mediaId]);}
 else{const state=j.attempts>=3?'failed':'pending';await db.query("update momentnest.media set status=$1,error_code='PROCESSING_FAILED' where id=$2",[state,j.mediaId]);await db.query("update momentnest.media_jobs set state=$1,available_at=clock_timestamp()+interval '30 seconds',lease_until=null,claim_token=null,updated_at=clock_timestamp() where media_id=$2",[state,j.mediaId]);}return true;
});}
// Saving and cleaning lock the same session; bound originals are never claimed.
export async function claimExpired(tx:Transaction){return tx(async db=>{
 const r=await db.query("select id,object_key from momentnest.upload_sessions u where expires_at<clock_timestamp() and state not in ('bound','expired') and not exists(select 1 from momentnest.media m where m.upload_session_id=u.id) order by expires_at limit 20 for update skip locked");
 for(const u of r.rows)await db.query("update momentnest.upload_sessions set state='cleanup_claimed' where id=$1",[u.id]);return r.rows;
});}

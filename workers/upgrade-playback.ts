import {randomUUID} from 'node:crypto';
import {stat} from 'node:fs/promises';
import type {Transaction} from '../src/server/event-store';
import {objectPath} from '../src/server/storage/local';
import {processMedia,discardOutputs} from './process-media';

// Explicit, bounded maintenance: retain the original and old playable copy.
// Encoding happens outside the transaction; publish only if the snapshot is current.
export async function upgradePlayback(tx:Transaction,id:string){
 const row=await tx(async db=>(await db.query(`select m.*,j.generation from momentnest.media m join momentnest.media_jobs j on j.media_id=m.id
  where m.id=$1 and m.kind='video' and m.status='ready' and j.state='ready' and m.preview_key is not null and m.playback_key is not null`,[id])).rows[0]);
 if(!row)throw Error('READY_VIDEO_REQUIRED');
 if((row.metadata as Record<string,unknown>)?.playbackProfile==='mobile-v1')return {status:'already-upgraded'};
 const job={mediaId:id,token:randomUUID(),generation:Number(row.generation),attempts:1,key:String(row.object_key),kind:'video',sha256:String(row.sha256),previewKey:String(row.preview_key),metadata:row.metadata as Record<string,unknown>};
 const result=await processMedia(job,'playback');
 const before=(await stat(objectPath(String(row.playback_key)))).size,after=(await stat(objectPath(result.playbackKey!))).size;
 const published=await tx(async db=>{
  const jobs=await db.query("select media_id from momentnest.media_jobs where media_id=$1 and generation=$2 and state='ready' for update",[id,row.generation]);
  if(!jobs.rows.length)return false;
  const updated=await db.query(`update momentnest.media set playback_key=$1,metadata=metadata||$2::jsonb where id=$3 and playback_key=$4 and status='ready' returning id`,[result.playbackKey,JSON.stringify({...result.metadata,previousPlaybackKey:row.playback_key}),id,row.playback_key]);
  return updated.rows.length===1;
 });
 if(!published){await discardOutputs(job);throw Error('VIDEO_CHANGED_DURING_UPGRADE');}
 return {status:'upgraded',beforeBytes:before,afterBytes:after};
}

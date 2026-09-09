import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Transaction } from '../src/server/event-store';
import { objectPath } from '../src/server/storage/local';
import { resizeExistingPreview } from './process-media';

// Idle-time upgrade of legacy previews; no source reads, retranscoding or event edits.
export async function backfillPreview(tx:Transaction):Promise<boolean>{
 let base:string|undefined;
 try{return await tx(async db=>{
  const {rows}=await db.query(`select m.id,m.preview_key from momentnest.media m join momentnest.media_jobs j on j.media_id=m.id
   where m.status='ready' and j.state='ready' and m.preview_key is not null and not (m.metadata ? 'previewSizes')
   order by m.created_at limit 1 for update of j skip locked`);
  const row=rows[0];if(!row)return false;
  base=`derivatives/${row.id}/thumbs-${randomUUID()}`;
  const metadata=await resizeExistingPreview(String(row.preview_key),base);
  await db.query('update momentnest.media set metadata=metadata||$1::jsonb where id=$2',[JSON.stringify(metadata),row.id]);
  return true;
 });}catch(error){
  if(base)await Promise.all([480,960].map(size=>rm(objectPath(`${base}-${size}.jpg`),{force:true})));
  throw error;
 }
}

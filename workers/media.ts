import { setTimeout as pause } from 'node:timers/promises';
import { dirname,basename,join } from 'node:path';
import { rm,readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { claimJob,heartbeat,finishJob,finishPreviewJob,claimExpired,type MediaLane } from '../src/server/job-store';
import { processMedia,discardOutputs } from './process-media';
import { backfillPreview } from './backfill-preview';
import { workerPool,poolTransaction } from './pool';
import { objectPath } from '../src/server/storage/local';
const pool=workerPool(),tx=poolTransaction(pool);let stopping=false,lastCleanup=0;
const once=process.argv.includes('--once');
sharp.concurrency(1);
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
console.log('Media worker ready; preview concurrency=1; video concurrency=1');
async function cleanup(){
  if(Date.now()-lastCleanup>60000){
   for(const u of await claimExpired(tx)){
    // The claiming transaction excludes bound rows; recheck references before deleting bytes.
    const r=await pool.query("select id from momentnest.upload_sessions u where id=$1 and state='cleanup_claimed' and not exists(select 1 from momentnest.media m where m.upload_session_id=u.id)",[u.id]);
    if(!r.rows.length)continue;await rm(objectPath(String(u.object_key)),{force:true});await rm(objectPath(String(u.object_key))+'.json',{force:true});const path=objectPath(String(u.object_key));await rm(path+'.parts',{recursive:true,force:true});for(const name of await readdir(dirname(path)).catch(()=>[]))if(name.startsWith(basename(path)+'.')&&name.endsWith('.part'))await rm(join(dirname(path),name),{force:true});await pool.query("update momentnest.upload_sessions set state='expired' where id=$1 and state='cleanup_claimed'",[u.id]);
   }lastCleanup=Date.now();
  }
}
async function lane(kind:MediaLane){
 while(!stopping){
  try{
   if(kind==='preview')await cleanup();
   const j=await claimJob(tx,kind);
   if(!j){
    if(once)break;
    if(kind==='preview')await backfillPreview(tx);
    await pause(2000);continue;
   }
   const timer=setInterval(()=>{void heartbeat(pool,j).catch(()=>{});},20000);
   try{
    const previewOnly=kind==='preview'&&j.kind==='video';
    const result=await processMedia(j,previewOnly?'preview':kind==='video'?'playback':'full');
    const accepted=previewOnly?await finishPreviewJob(tx,j,result):await finishJob(tx,j,result);
    if(!accepted)await discardOutputs(j);
    console.log(`Media ${kind} job processed`);
   }catch{
    await finishJob(tx,j,null);
    console.log(`Media ${kind} job failed; original retained`);
   }finally{clearInterval(timer);}
   if(once)break;
  }catch{
   console.log(`Media ${kind} lane temporarily unavailable`);
   if(once){process.exitCode=1;break;}
   await pause(5000);
  }
 }
}
// Separate consumers share the leased queue; long encodes cannot occupy the preview lane.
if(once){await lane('preview');await lane('video');}
else await Promise.all([lane('preview'),lane('video')]);
await pool.end();

import { setTimeout as pause } from 'node:timers/promises';
import { dirname,basename,join } from 'node:path';
import { rm,readdir } from 'node:fs/promises';
import { claimJob,heartbeat,finishJob,claimExpired } from '../src/server/job-store';
import { processMedia } from './process-media';
import { workerPool,poolTransaction } from './pool';
import { objectPath } from '../src/server/storage/local';
const pool=workerPool(),tx=poolTransaction(pool);let stopping=false,lastCleanup=0;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
console.log('Media worker ready; concurrency=1');
while(!stopping){
 try{
  if(Date.now()-lastCleanup>60000){
   for(const u of await claimExpired(tx)){
    // The claiming transaction excludes bound rows; recheck references before deleting bytes.
    const r=await pool.query("select id from momentnest.upload_sessions u where id=$1 and state='cleanup_claimed' and not exists(select 1 from momentnest.media m where m.upload_session_id=u.id)",[u.id]);
    if(!r.rows.length)continue;await rm(objectPath(String(u.object_key)),{force:true});await rm(objectPath(String(u.object_key))+'.json',{force:true});const path=objectPath(String(u.object_key));for(const name of await readdir(dirname(path)).catch(()=>[]))if(name.startsWith(basename(path)+'.')&&name.endsWith('.part'))await rm(join(dirname(path),name),{force:true});await pool.query("update momentnest.upload_sessions set state='expired' where id=$1 and state='cleanup_claimed'",[u.id]);
   }lastCleanup=Date.now();
  }
  const j=await claimJob(tx);if(!j){if(process.argv.includes('--once'))break;await pause(2000);continue;}
  const timer=setInterval(()=>{void heartbeat(pool,j).catch(()=>{});},20000);
  try{const result=await processMedia(j);const accepted=await finishJob(tx,j,result);if(!accepted){await rm(objectPath(result.previewKey),{force:true});if(result.playbackKey)await rm(objectPath(result.playbackKey),{force:true});}console.log('Media job processed');}
  catch{await finishJob(tx,j,null);console.log('Media derivative failed; original retained');}
  finally{clearInterval(timer);}
  if(process.argv.includes('--once'))break;
 }catch{console.log('Media worker temporarily unavailable');if(process.argv.includes('--once')){process.exitCode=1;break;}await pause(5000);}
}
await pool.end();

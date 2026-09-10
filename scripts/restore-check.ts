// Restores into a NEW isolated PostgreSQL-compatible directory, never a live database.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { mkdir,writeFile,access,copyFile } from 'node:fs/promises';
import { resolve,join,dirname } from 'node:path';
import { backupTables,verifySnapshot } from '../src/server/backup';
const source=process.argv[2],destination=process.argv[3];
if(!source||!destination)throw Error('Usage: restore:check <backup-folder> <new-isolated-folder>');
const dest=resolve(destination);try{await access(dest);throw Error('Destination exists');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
const snapshot=await verifySnapshot(resolve(source));await mkdir(dest,{recursive:false,mode:0o700});
for(const file of snapshot.files){const target=join(dest,'media',file.key);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(join(resolve(source),'originals',file.key),target);}
const db=new PGlite(join(dest,'database'));
try{
 await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 for(const name of ['20260907171842_m1_private_events.sql','20260908011410_v1_media.sql','20260910055215_raise_media_limit_to_50.sql','20260910070728_raise_media_limit_to_100.sql','20260910074242_remove_event_media_count_limit.sql','20260910075100_add_media_time_review_flag.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.transaction(async t=>{
  for(const m of snapshot.tables.members)await t.query('insert into auth.users values($1) on conflict do nothing',[m.auth_user_id]);
  // Preserve original identity/time during restore; re-enable before validation.
  await t.exec('alter table momentnest.events disable trigger guard_event;');
  for(const table of backupTables){for(const row of snapshot.tables[table]){
   const columns=Object.keys(row);if(columns.some(c=>!/^[a-z_][a-z0-9_]*$/.test(c)))throw Error('INVALID_COLUMN');
   const values=columns.map(c=>{const v=row[c];return typeof v==='object'&&v!==null?JSON.stringify(v):v;});
   await t.query(`insert into momentnest.${table}(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,values);
  }}
  await t.exec('set constraints all immediate;alter table momentnest.events enable trigger guard_event;');
 });
 await db.exec("update momentnest.media set status='pending',preview_key=null,playback_key=null,error_code=null; update momentnest.media_jobs set state='pending',attempts=0,generation=generation+1,claim_token=null,lease_until=null,available_at=clock_timestamp();");
 // Temporary bytes are deliberately excluded from a backup. Their old verified
 // sessions must not authorize a save of a now-missing original after restore.
 await db.exec("update momentnest.upload_sessions set state='expired' where state<>'bound';");
 const counts:Record<string,number>={};for(const table of backupTables){const r=await db.query<{n:number}>(`select count(*)::int as n from momentnest.${table}`);counts[table]=r.rows[0].n;if(counts[table]!==snapshot.tables[table].length)throw Error('COUNT_MISMATCH');}
 await writeFile(join(dest,'restore-report.json'),JSON.stringify({ok:true,isolated:true,counts,verifiedOriginals:snapshot.files.length,auth:'Identity placeholders only; real sign-in requires restored Supabase Auth or operator remapping',at:new Date().toISOString()},null,2),{mode:0o600});console.log(JSON.stringify({ok:true,counts,verifiedOriginals:snapshot.files.length}));
}finally{await db.close();}

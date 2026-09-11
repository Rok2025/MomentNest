import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {saveEvent,type Transaction} from '../src/server/event-store';
import {authorizeUploads,completeUpload} from '../src/server/media-store';

const auth=randomUUID(),household=randomUUID();let db:PGlite;
const tx:Transaction=fn=>db.transaction(t=>fn(t));
beforeAll(async()=>{
 db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 for(const name of ['20260907171842_m1_private_events.sql','20260908011410_v1_media.sql','20260910055215_raise_media_limit_to_50.sql','20260910070728_raise_media_limit_to_100.sql','20260910074242_remove_event_media_count_limit.sql','20260910075100_add_media_time_review_flag.sql','20260910123000_raise_video_limit_to_1gb.sql','20260910150000_upload_drafts_and_hashes.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1)',[auth]);await db.query('insert into momentnest.households(id,name) values($1,$2)',[household,'保存测试']);
 await db.query('insert into momentnest.subjects(household_id) values($1)',[household]);
 await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸')",[household,auth]);
});
afterAll(async()=>{await db.close();});
async function files(count:number){
 const rows=await authorizeUploads(tx,auth,Array.from({length:count},(_,i)=>({name:`${i}.jpg`,size:123})));
 for(const row of rows)await completeUpload(tx,auth,String(row.id),{sha256:createHash('sha256').update(String(row.id)).digest('hex'),size:123,kind:'image',mime:'image/jpeg'});
 return rows.map(row=>String(row.id));
}
const input=(ids:string[])=>({requestKey:randomUUID(),title:'',body:'',feeling:'',occurredOn:'2025-08-01',uploadIds:ids});
describe('batched save transaction',()=>{
 it('允许1000份批量授权和保存，拒绝第1001份',async()=>{
  const allowed=await authorizeUploads(tx,auth,Array.from({length:1000},(_,i)=>({name:`limit-${i}.jpg`,size:123})));
  expect(allowed).toHaveLength(1000);
  await db.query("delete from momentnest.upload_sessions where filename like 'limit-%'");
  await expect(authorizeUploads(tx,auth,Array.from({length:1001},()=>({name:'limit.jpg',size:123})))).rejects.toMatchObject({code:'VALIDATION'});
  await expect(saveEvent(tx,auth,input(Array.from({length:1001},()=>randomUUID())))).rejects.toThrow();
 });
 it('单条回忆可分批追加到201份，计数、顺序和任务保持一致',async()=>{
  const old=await files(100),id=await saveEvent(tx,auth,input(old));
  const added=await files(100);await saveEvent(tx,auth,{...input(added),id,expectedVersion:1});
  const extra=await files(1);await saveEvent(tx,auth,{...input(extra),id,expectedVersion:2});
  expect((await db.query('select media_count,version from momentnest.events where id=$1',[id])).rows).toEqual([{media_count:201,version:3}]);
  const media=(await db.query<{upload_session_id:string;position:number}>('select upload_session_id,position from momentnest.media where event_id=$1 order by position',[id])).rows;
  expect(media.map(m=>m.upload_session_id)).toEqual([...old,...added,...extra]);
  expect(media.map(m=>m.position)).toEqual(Array.from({length:201},(_,i)=>i));
  expect((await db.query('select j.media_id from momentnest.media_jobs j join momentnest.media m on m.id=j.media_id where m.event_id=$1',[id])).rows).toHaveLength(201);
  await expect(db.query('update momentnest.events set body=$2,media_count=-1,version=version+1 where id=$1',[id,'非负计数校验'])).rejects.toMatchObject({code:'23514',constraint:'events_media_count_check'});
 });
 it.each([[20,false],[20,true],[50,false],[50,true],[100,false],[100,true]] as const)('%i份附件批量保存，跨天=%s，顺序、任务、幂等性和运行角色权限保持正确',async(count,split)=>{
  const ids=await files(count),raw={...input(ids),uploadDates:ids.map((id,i)=>({id,occurredOn:split?`2025-08-${String(i%25+1).padStart(2,'0')}`:'2025-08-01'}))};
  let queries=0;const counted:Transaction=fn=>tx(t=>fn({query:async(sql,args)=>{queries++;return t.query(sql,args);}}));
  // Exercise the actual restricted application grants, not a privileged writer.
  await db.exec('set role momentnest_app');let id:string;
  try{id=await saveEvent(counted,auth,raw);expect(queries).toBe(split?12:11);expect(await saveEvent(tx,auth,raw)).toBe(id);}
  finally{await db.exec('reset role');}
  const media=await db.query<{upload_session_id:string;position:number;occurred_on:string;event_id:string;state:string}>(`select m.upload_session_id,m.position,m.event_id,e.occurred_on::text,j.state from momentnest.media m
   join momentnest.events e on e.id=m.event_id join momentnest.media_jobs j on j.media_id=m.id where m.upload_session_id=any($1::uuid[])`,[ids]);
  expect(media.rows).toHaveLength(count);expect(new Set(media.rows.map(m=>m.event_id)).size).toBe(split?Math.min(count,25):1);
  for(const [i,uploadId] of ids.entries())expect(media.rows.find(m=>m.upload_session_id===uploadId)).toMatchObject({position:split?Math.floor(i/25):i,occurred_on:raw.uploadDates[i].occurredOn,state:'pending'});
  expect((await db.query<{state:string}>('select state from momentnest.upload_sessions where id=any($1::uuid[])',[ids])).rows.every(r=>r.state==='bound')).toBe(true);
  expect((await db.query('select event_id from momentnest.save_requests where request_key=$1',[raw.requestKey])).rows).toEqual([{event_id:id!}]);
 });
 it('追加素材保留旧顺序和校验值，不重复创建旧处理任务',async()=>{
  const old=await files(2),id=await saveEvent(tx,auth,input(old)),added=await files(3);
  await saveEvent(tx,auth,{...input(added),id,expectedVersion:1});
  const rows=(await db.query<{upload_session_id:string;position:number;sha256:string}>('select upload_session_id,position,sha256 from momentnest.media where event_id=$1 order by position',[id])).rows;
  expect(rows.map(r=>r.upload_session_id)).toEqual([...old,...added]);expect(rows.map(r=>r.position)).toEqual([0,1,2,3,4]);expect(rows.every(r=>r.sha256===createHash('sha256').update(r.upload_session_id).digest('hex'))).toBe(true);
  expect((await db.query('select j.media_id from momentnest.media_jobs j join momentnest.media m on m.id=j.media_id where m.event_id=$1',[id])).rows).toHaveLength(5);
 });
 it('批量绑定失败回滚全部日期和任务，原上传仍可用同一请求重试',async()=>{
  const ids=await files(3),raw={...input(ids),uploadDates:ids.map((id,i)=>({id,occurredOn:`2025-09-0${i+1}`}))};
  const broken:Transaction=fn=>tx(t=>fn({query:async(sql,args)=>{if(sql.startsWith('update momentnest.upload_sessions u'))throw Error('simulated bind failure');return t.query(sql,args);}}));
  const before=(await db.query('select count(*)::int as n from momentnest.events')).rows;
  await expect(saveEvent(broken,auth,raw)).rejects.toThrow('simulated bind failure');
  expect((await db.query('select count(*)::int as n from momentnest.events')).rows).toEqual(before);
  expect((await db.query('select id from momentnest.media where upload_session_id=any($1::uuid[])',[ids])).rows).toHaveLength(0);
  expect((await db.query('select event_id from momentnest.save_requests where request_key=$1',[raw.requestKey])).rows).toHaveLength(0);
  expect((await db.query<{state:string}>('select state from momentnest.upload_sessions where id=any($1::uuid[])',[ids])).rows.every(r=>r.state==='verified')).toBe(true);
  const id=await saveEvent(tx,auth,raw);expect(await saveEvent(tx,auth,raw)).toBe(id);
 });
});

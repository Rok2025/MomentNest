import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { saveEvent,getEvent,listEvents,type Transaction } from '../src/server/event-store';
import { authorizeUpload,authorizeUploads,completeUpload,cancelUpload,listMedia,retryMedia } from '../src/server/media-store';
import { claimJob,finishJob,claimExpired } from '../src/server/job-store';
import { heatmapCounts } from '../src/server/heatmap-store';
const father=randomUUID(),mother=randomUUID(),outsider=randomUUID(),h=randomUUID();let db:PGlite;
const tx:Transaction=fn=>db.transaction(t=>fn(t));
const raw=(ids:string[]=[])=>({requestKey:randomUUID(),title:'媒体测试',body:'',feeling:'',occurredOn:'2025-06-01',uploadIds:ids});
async function upload(auth=father){const u=await authorizeUpload(tx,auth,{name:'photo.jpg',size:123});await completeUpload(tx,auth,String(u.id),{sha256:createHash('sha256').update(String(u.id)).digest('hex'),size:123,kind:'image',mime:'image/jpeg'});return String(u.id);}
beforeAll(async()=>{db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');for(const name of ['20260907171842_m1_private_events.sql','20260908011410_v1_media.sql','20260910055215_raise_media_limit_to_50.sql','20260910070728_raise_media_limit_to_100.sql','20260910074242_remove_event_media_count_limit.sql','20260910075100_add_media_time_review_flag.sql','20260910123000_raise_video_limit_to_1gb.sql','20260910150000_upload_drafts_and_hashes.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));await db.query('insert into auth.users values($1),($2),($3)',[father,mother,outsider]);await db.query('insert into momentnest.households(id,name) values($1,$2)',[h,'隔离家庭']);await db.query('insert into momentnest.subjects(household_id) values($1)',[h]);await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸'),($1,$3,'妈妈')",[h,father,mother]);});
afterAll(async()=>{await db.close();});
describe('media save and job contracts',()=>{
 it('批量授权只开一次事务，保持选择顺序且重试复用原上传',async()=>{
  let transactions=0,queries=0;const counted:Transaction=fn=>tx(t=>{transactions++;return fn({query:async(sql,args)=>{queries++;return t.query(sql,args);}});});
  const files=[{name:'second.mp4',size:456},{name:'first.jpg',size:123},{name:'first.jpg',size:123}];
  const rows=await authorizeUploads(counted,father,files);
  expect(transactions).toBe(1);expect(queries).toBe(3);
  expect(rows.map(r=>({name:r.filename,size:Number(r.expected_size)}))).toEqual(files);
  expect(new Set(rows.map(r=>r.id)).size).toBe(3);
  expect((await authorizeUpload(tx,father,{...files[0],id:String(rows[0].id)})).id).toBe(rows[0].id);
  await expect(authorizeUpload(tx,mother,{...files[0],id:String(rows[0].id)})).rejects.toMatchObject({code:'VALIDATION'});
  await Promise.all(rows.map(r=>cancelUpload(tx,father,String(r.id))));
 });
 it('批量授权拒绝超限、不合法文件及家庭外用户，失败不插入半批',async()=>{
  const before=(await db.query('select count(*)::int as n from momentnest.upload_sessions')).rows[0];
  await expect(authorizeUploads(tx,father,[])).rejects.toMatchObject({code:'VALIDATION'});
  await expect(authorizeUploads(tx,father,Array.from({length:101},()=>({name:'x.jpg',size:10})))).rejects.toMatchObject({code:'VALIDATION'});
  await expect(authorizeUploads(tx,father,[{name:'ok.jpg',size:10},{name:'bad.exe',size:10}])).rejects.toMatchObject({code:'VALIDATION'});
  await expect(authorizeUploads(tx,outsider,[{name:'x.jpg',size:10}])).rejects.toMatchObject({code:'FORBIDDEN'});
  expect((await db.query('select count(*)::int as n from momentnest.upload_sessions')).rows[0]).toEqual(before);
 });
 it('历史未保存任务超过100份也不阻止新批次，容量单独受限',async()=>{
  const m=(await db.query<{id:string}>('select id from momentnest.members where auth_user_id=$1',[father])).rows[0];
  await db.query(`insert into momentnest.upload_sessions(household_id,member_id,object_key,filename,kind,expected_size)
    select $1,$2,'originals/quota-'||n||'.bin','__quota.jpg','image',10 from generate_series(1,100) as n`,[h,m.id]);
  try{
   const next=await authorizeUploads(tx,father,[{name:'a.jpg',size:10},{name:'b.jpg',size:10}]);expect(next).toHaveLength(2);
   await Promise.all(next.map(r=>cancelUpload(tx,father,String(r.id))));
  }finally{await db.query("delete from momentnest.upload_sessions where filename='__quota.jpg'");}
 });
 it('纯媒体原件验证、绑定、入队与计数同事务，同键重试只一条',async()=>{const id=await upload(),r=raw([id]);const event=await saveEvent(tx,father,r);expect(await saveEvent(tx,father,r)).toBe(event);expect(await getEvent(db,father,event)).toMatchObject({mediaCount:1,imageCount:1,videoCount:0});expect((await listMedia(db,mother,event)).length).toBe(1);expect((await heatmapCounts(db,father)).find(d=>d.date==='2025-06-01')?.count).toBe(1);expect((await db.query('select state from momentnest.upload_sessions where id=$1',[id])).rows[0]).toEqual({state:'bound'});});
 it('跨天上传原子归档，文字只归选定日期，重试不重复',async()=>{
  const ids=[await upload(),await upload(),await upload()];
  const input={...raw(ids),body:'今天的文字',occurredOn:'2025-07-03',uploadDates:[{id:ids[0],occurredOn:'2025-07-01'},{id:ids[1],occurredOn:'2025-07-01'},{id:ids[2],occurredOn:'2025-07-02'}]};
  const id=await saveEvent(tx,father,input);expect(await saveEvent(tx,father,input)).toBe(id);
  expect(await getEvent(db,mother,id)).toMatchObject({occurredOn:'2025-07-03',body:'今天的文字',mediaCount:0});
  const events=(await listEvents(db,father,undefined,{start:'2025-07-01',end:'2025-07-03'})).items;
  expect(events).toHaveLength(3);expect(events.find(e=>e.occurredOn==='2025-07-01')).toMatchObject({body:'',mediaCount:2});
  expect(events.find(e=>e.occurredOn==='2025-07-02')).toMatchObject({body:'',mediaCount:1});
  await expect(saveEvent(tx,father,{...input,uploadDates:input.uploadDates.map(d=>({...d,occurredOn:'2025-07-04'}))})).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('纯媒体不创建空的所选日期，日期无效或与上传不匹配时整体拒绝',async()=>{
  const id=await upload();const input={...raw([id]),uploadDates:[{id,occurredOn:'2025-07-05'}]};
  await expect(saveEvent(tx,father,{...input,uploadDates:[{id,occurredOn:'2025-02-30'}]})).rejects.toMatchObject({code:'VALIDATION'});
  await expect(saveEvent(tx,father,{...input,uploadDates:[]})).rejects.toThrow();
  const event=await saveEvent(tx,father,input);expect(await getEvent(db,father,event)).toMatchObject({occurredOn:'2025-07-05',mediaCount:1,body:''});
 });
 it('跨天保存失败整批回滚，编辑旧记录可追加异日媒体且仍校验版本',async()=>{
  const ids=[await upload(),await upload()];const input={...raw(ids),uploadDates:[{id:ids[0],occurredOn:'2025-07-06'},{id:ids[1],occurredOn:'2025-07-07'}]};
  const bad:Transaction=fn=>db.transaction(async t=>{await fn(t);throw Error('rollback batch');});
  await expect(saveEvent(bad,father,input)).rejects.toThrow('rollback batch');
  expect((await db.query<{state:string}>('select state from momentnest.upload_sessions where id=any($1::uuid[])',[ids])).rows.every(r=>r.state==='verified')).toBe(true);
  const original=await saveEvent(tx,father,{...raw(),body:'旧记录'});
  const edit={...input,id:original,expectedVersion:1,body:'补充后的文字'};await saveEvent(tx,father,edit);
  expect(await getEvent(db,father,original)).toMatchObject({body:'补充后的文字',version:2,mediaCount:0});
 });
 it('不接受未验证、取消、过期、重复或他人上传',async()=>{const u=await authorizeUpload(tx,father,{name:'test.mp4',size:200});await expect(saveEvent(tx,father,raw([String(u.id)]))).rejects.toMatchObject({code:'VALIDATION'});const id=await upload();await expect(saveEvent(tx,mother,raw([id]))).rejects.toMatchObject({code:'VALIDATION'});await expect(saveEvent(tx,father,raw([id,id]))).rejects.toMatchObject({code:'VALIDATION'});await cancelUpload(tx,father,id);await expect(saveEvent(tx,father,raw([id]))).rejects.toMatchObject({code:'VALIDATION'});const expired=await upload();await db.query("update momentnest.upload_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1",[expired]);await expect(saveEvent(tx,father,raw([expired]))).rejects.toMatchObject({code:'VALIDATION'});});
 it('实际内容/大小必须与授权一致，拒绝超限和空文件',async()=>{await expect(authorizeUpload(tx,father,{name:'x.jpg',size:51*1024*1024})).rejects.toMatchObject({code:'VALIDATION'});await expect(authorizeUpload(tx,father,{name:'x.mp4',size:0})).rejects.toMatchObject({code:'VALIDATION'});const large=await authorizeUpload(tx,father,{name:'large.mp4',size:1024*1024*1024});expect(Number(large.expected_size)).toBe(1024*1024*1024);await cancelUpload(tx,father,String(large.id));const u=await authorizeUpload(tx,father,{name:'x.jpg',size:42});await expect(completeUpload(tx,father,String(u.id),{size:43,kind:'video',mime:'video/mp4',sha256:'a'.repeat(64)})).rejects.toMatchObject({code:'VALIDATION'});});
 it('保存回滚不留下媒体或任务，verified素材可重新提交',async()=>{const u=await upload();const bad:Transaction=fn=>db.transaction(async t=>{await fn(t);throw Error('connection dropped before commit');});await expect(saveEvent(bad,father,raw([u]))).rejects.toThrow();expect((await db.query('select state from momentnest.upload_sessions where id=$1',[u])).rows[0]).toEqual({state:'verified'});expect((await db.query('select id from momentnest.media where upload_session_id=$1',[u])).rows).toHaveLength(0);await saveEvent(tx,father,raw([u]));});
 it('共同编辑只能追加，保留原件；封面必须属于当前事件',async()=>{const event=await saveEvent(tx,father,raw([await upload()]));const media=await listMedia(db,father,event);await saveEvent(tx,mother,{...raw([await upload(mother)]),id:event,expectedVersion:1,coverMediaId:media[0].id});const e=await getEvent(db,father,event);expect(e.mediaCount).toBe(2);expect(e.author).toBe('爸爸');expect(e.editor).toBe('妈妈');expect(e.coverMediaId).toBe(media[0].id);await expect(saveEvent(tx,mother,{...raw(),id:event,expectedVersion:2,coverMediaId:randomUUID()})).rejects.toMatchObject({code:'VALIDATION'});});
 it('未授权成员无法上传/查看；SQL不能伪造附件数量',async()=>{await expect(authorizeUpload(tx,outsider,{name:'x.jpg',size:2})).rejects.toMatchObject({code:'FORBIDDEN'});const event=await saveEvent(tx,father,raw([await upload()]));await expect(listMedia(db,outsider,event)).rejects.toMatchObject({code:'FORBIDDEN'});await expect(db.query('update momentnest.events set media_count=2,version=version+1 where id=$1',[event])).rejects.toThrow('media count mismatch');});
 it('租约失效可重领，旧任务结果不能覆盖新一轮',async()=>{const old=await claimJob(tx);expect(old).not.toBeNull();await db.query("update momentnest.media_jobs set lease_until=clock_timestamp()-interval '1 second' where media_id=$1",[old!.mediaId]);const next=await claimJob(tx);expect(next!.mediaId).toBe(old!.mediaId);expect(next!.token).not.toBe(old!.token);const result={previewKey:'derivatives/test.jpg',playbackKey:null,capturedText:null,capturedZone:null,metadata:{}};expect(await finishJob(tx,old!,result)).toBe(false);expect(await finishJob(tx,next!,result)).toBe(true);});
 it('失败达到上限后可手动重试，原件和事件时间保持不变',async()=>{const j=await claimJob(tx);await finishJob(tx,{...j!,attempts:3},null);const before=await db.query('select created_at,object_key from momentnest.media where id=$1',[j!.mediaId]);await retryMedia(tx,mother,j!.mediaId);expect((await db.query('select state,generation,attempts from momentnest.media_jobs where media_id=$1',[j!.mediaId])).rows[0]).toMatchObject({state:'pending',generation:2,attempts:0});expect((await db.query('select created_at,object_key from momentnest.media where id=$1',[j!.mediaId])).rows).toEqual(before.rows);});
 it('清理占用后拒绝保存，已绑定原件不会被清理',async()=>{const pending=await upload();await db.query("update momentnest.upload_sessions set expires_at=clock_timestamp()-interval '1 second' where id=$1 or state='bound'",[pending]);const claimed=await claimExpired(tx);expect(claimed.some(u=>u.id===pending)).toBe(true);const bound=await db.query<{id:string}>("select id from momentnest.upload_sessions where state='bound'");expect(claimed.some(u=>bound.rows.some(b=>b.id===u.id))).toBe(false);await expect(saveEvent(tx,father,raw([pending]))).rejects.toMatchObject({code:'VALIDATION'});});
 it('范围查询返回全部匹配事件，媒体数不影响热力图数量',async()=>{const page=await listEvents(db,father,undefined,{start:'2025-06-01',end:'2025-06-01'});expect(page.items.length).toBeGreaterThan(1);const days=await heatmapCounts(db,father);const count=await db.query<{n:number}>("select count(*)::int as n from momentnest.events where occurred_on='2025-06-01'");expect(days.find(d=>d.date==='2025-06-01')?.count).toBe(count.rows[0].n);});
 it('worker无事件写入和删除权限，应用无媒体原件覆盖权限',async()=>{const r=await db.query("select has_table_privilege('momentnest_worker','momentnest.events','update') as event_write,has_table_privilege('momentnest_worker','momentnest.media','delete') as del,has_column_privilege('momentnest_app','momentnest.media','object_key','update') as overwrite");expect(r.rows[0]).toEqual({event_write:false,del:false,overwrite:false});});
});

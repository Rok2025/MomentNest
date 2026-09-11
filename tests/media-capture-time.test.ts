import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {saveEvent,type Transaction} from '../src/server/event-store';
import {authorizeUpload,completeUpload,listMedia,updateMediaCaptureTime} from '../src/server/media-store';
import {captureTimeInput,captureTimeInputValue} from '../src/domain/media-capture-time';
import {claimJob,finishJob,finishPreviewJob} from '../src/server/job-store';

let db:PGlite;
const father=randomUUID(),mother=randomUUID(),outsider=randomUUID(),household=randomUUID(),otherHousehold=randomUUID();
const tx:Transaction=fn=>db.transaction(t=>fn(t));
beforeAll(async()=>{
 db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(directory).filter(file=>file.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,directory),'utf8'));
 await db.query('insert into auth.users values($1),($2),($3)',[father,mother,outsider]);
 await db.query('insert into momentnest.households(id,name) values($1,$3),($2,$3)',[household,otherHousehold,'时间编辑测试']);
 await db.query('insert into momentnest.subjects(household_id) values($1),($2)',[household,otherHousehold]);
 await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$3,'爸爸'),($1,$4,'妈妈'),($2,$5,'爸爸')",[household,otherHousehold,father,mother,outsider]);
});
afterAll(async()=>{await db.close();});
async function fixture(video=false){
 const ids=[];
 for(let i=0;i<2;i++){
  const u=await authorizeUpload(tx,father,{name:video?'clip.mp4':'photo.jpg',size:123});
  await completeUpload(tx,father,String(u.id),{sha256:createHash('sha256').update(String(u.id)).digest('hex'),size:123,kind:video?'video':'image',mime:video?'video/mp4':'image/jpeg'});ids.push(String(u.id));
 }
 const eventId=await saveEvent(tx,father,{requestKey:randomUUID(),title:'原记录',body:'不应修改',feeling:'',occurredOn:'2025-06-01',uploadIds:ids});
 await db.query("update momentnest.media set captured_text='2025:06:01 09:15:30',captured_zone='+08:00' where event_id=$1",[eventId]);
 return {eventId,media:await listMedia(db,father,eventId)};
}
const change={capturedTime:'2025-07-26T19:27:16',expectedOverride:null};
describe('single-file capture time',()=>{
 it('normalizes input, rejects invalid days/hours and unrelated edit fields',()=>{
  expect(captureTimeInput.parse({...change,capturedTime:'2025-07-26T19:27'}).capturedTime).toBe('2025-07-26T19:27:00');
  for(const capturedTime of ['2025-02-30T12:00','2025-07-26T24:00','1969-01-01T00:00','2025-07-26','invalid'])expect(captureTimeInput.safeParse({...change,capturedTime}).success).toBe(false);
  expect(captureTimeInput.safeParse({...change,eventId:randomUUID()}).success).toBe(false);
  expect(captureTimeInputValue('2025-07-25T18:30:12Z','UTC')).toBe('2025-07-26T02:30:12');
  expect(captureTimeInputValue('2025:07:26 19:27:16',null)).toBe('2025-07-26T19:27:16');
  expect(captureTimeInputValue(null,null)).toBe('');
  expect(captureTimeInputValue('2025-07-26',null)).toBe('');
 });
 it('updates only one file as the restricted application role, preserving event, sibling and raw metadata',async()=>{
  const {eventId,media}=await fixture();
  const before=(await db.query('select * from momentnest.events where id=$1',[eventId])).rows;
  const siblings=(await db.query('select * from momentnest.media where id=$1',[media[1].id])).rows;
  const original=(await db.query('select captured_text,captured_zone,object_key,sha256 from momentnest.media where id=$1',[media[0].id])).rows;
  await db.exec('set role momentnest_app');
  try{expect(await updateMediaCaptureTime(tx,mother,media[0].id,change)).toMatchObject({id:media[0].id,capturedText:change.capturedTime,capturedZone:'+08:00',captureTimeOverride:change.capturedTime});}
  finally{await db.exec('reset role');}
  expect((await db.query('select * from momentnest.events where id=$1',[eventId])).rows).toEqual(before);
  expect((await db.query('select * from momentnest.media where id=$1',[media[1].id])).rows).toEqual(siblings);
  expect((await db.query('select captured_text,captured_zone,object_key,sha256 from momentnest.media where id=$1',[media[0].id])).rows).toEqual(original);
  expect((await listMedia(db,father,eventId))[0].capturedText).toBe(change.capturedTime);
 });
 it('rejects another household, missing files and stale concurrent edits',async()=>{
  const {media}=await fixture();
  await expect(updateMediaCaptureTime(tx,outsider,media[0].id,change)).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(updateMediaCaptureTime(tx,father,randomUUID(),change)).rejects.toMatchObject({code:'NOT_FOUND'});
  await updateMediaCaptureTime(tx,father,media[0].id,change);
  await expect(updateMediaCaptureTime(tx,mother,media[0].id,{...change,capturedTime:'2025-07-27T12:00:00'})).rejects.toMatchObject({code:'CONFLICT'});
  expect(await updateMediaCaptureTime(tx,mother,media[0].id,{capturedTime:'2025-07-27T12:00:00',expectedOverride:change.capturedTime})).toMatchObject({capturedText:'2025-07-27T12:00:00'});
 });
 it('keeps corrections through preview and video completion, and denies worker overwrite',async()=>{
  const {eventId,media}=await fixture(true);
  await db.query("update momentnest.media_jobs set available_at=clock_timestamp()+interval '1 day' where media_id<>$1",[media[0].id]);
  const first=await claimJob(tx,'preview');expect(first?.mediaId).toBe(media[0].id);
  await updateMediaCaptureTime(tx,father,media[0].id,change);
  const processed={previewKey:'test-poster.jpg',playbackKey:null,capturedText:'2025-06-01T00:00:00Z',capturedZone:'UTC',metadata:{}};
  await db.exec('set role momentnest_worker');
  try{expect(await finishPreviewJob(tx,first!,processed)).toBe(true);}
  finally{await db.exec('reset role');}
  const second=await claimJob(tx,'video');
  await db.exec('set role momentnest_worker');
  try{
   expect(await finishJob(tx,second!,{...processed,playbackKey:'test-video.mp4'})).toBe(true);
   await expect(db.query('update momentnest.media set capture_time_override=null where id=$1',[media[0].id])).rejects.toThrow(/permission denied/);
  }finally{await db.exec('reset role');}
  expect((await listMedia(db,father,eventId))[0]).toMatchObject({capturedText:change.capturedTime,capturedZone:'+08:00',status:'ready'});
 });
});

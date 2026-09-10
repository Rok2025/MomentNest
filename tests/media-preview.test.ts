import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { mkdtemp,mkdir,rm,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { beforeAll,beforeEach,afterAll,describe,it,expect,vi } from 'vitest';
import { saveEvent,listEvents,type Transaction } from '../src/server/event-store';
import { authorizeUpload,completeUpload,listMedia,listEventCovers } from '../src/server/media-store';
import { claimJob,finishJob,finishPreviewJob } from '../src/server/job-store';
import { previewSizes,previewLinks } from '../src/server/media-preview';
import { objectPath,verifyTicket } from '../src/server/storage/local';
import { backfillPreview } from '../workers/backfill-preview';
import { mediaStatusText } from '../src/domain/media';
const father=randomUUID(),other=randomUUID(),house=randomUUID(),otherHouse=randomUUID();
let db:PGlite,root:string;
const tx:Transaction=fn=>db.transaction(t=>fn(t));
async function event(kind='image',auth=father){
 const u=await authorizeUpload(tx,auth,{name:kind==='image'?'photo.jpg':'clip.mov',size:100});
 await completeUpload(tx,auth,String(u.id),{sha256:'a'.repeat(64),size:100,kind,mime:kind==='image'?'image/jpeg':'video/quicktime'});
 const id=await saveEvent(tx,auth,{requestKey:randomUUID(),title:'',body:'',feeling:'',occurredOn:'2025-06-01',uploadIds:[String(u.id)]});
 return {id,media:(await listMedia(db,auth,id))[0]};
}
const poster=(mediaId:string)=>({previewKey:`derivatives/${mediaId}/poster.jpg`,playbackKey:null,capturedText:null,capturedZone:null,metadata:{previewSizes:[{key:`derivatives/${mediaId}/poster.jpg`,width:960,height:640}],previewWidth:960,previewHeight:640}});
beforeAll(async()=>{
 root=await mkdtemp(join(tmpdir(),'momentnest-preview-'));vi.stubEnv('MEDIA_ROOT',root);vi.stubEnv('MEDIA_SIGNING_SECRET','test-only-preview-signing-'+randomUUID());
 db=new PGlite();await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 for(const name of ['20260907171842_m1_private_events.sql','20260908011410_v1_media.sql','20260910055215_raise_media_limit_to_50.sql','20260910070728_raise_media_limit_to_100.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1),($2)',[father,other]);
 await db.query("insert into momentnest.households(id,name) values($1,'test'),($2,'other')",[house,otherHouse]);
 await db.query('insert into momentnest.subjects(household_id) values($1),($2)',[house,otherHouse]);
 await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸'),($3,$4,'爸爸')",[house,father,otherHouse,other]);
});
beforeEach(async()=>{await db.exec("update momentnest.media_jobs set state='ready';update momentnest.media set status='ready',metadata=metadata||'{\"previewSizes\":[]}'::jsonb");});
afterAll(async()=>{await db.close();await rm(root,{recursive:true,force:true});vi.unstubAllEnvs();});
describe('independent preview/video lanes and private cover reads',()=>{
 it('先发布视频封面，转码占用期间照片仍可领取，最终保留已发布封面',async()=>{
  const clip=await event('video');
  expect(await claimJob(tx,'video')).toBeNull();
  const first=(await claimJob(tx,'preview'))!;expect(first.mediaId).toBe(clip.media.id);
  expect(await finishPreviewJob(tx,first,poster(first.mediaId))).toBe(true);
  expect((await listMedia(db,father,clip.id))[0]).toMatchObject({status:'pending',hasPreview:true,hasPlayback:false});
  const encoding=(await claimJob(tx,'video'))!;expect(encoding.attempts).toBe(1);
  const photo=await event();const image=(await claimJob(tx,'preview'))!;expect(image.mediaId).toBe(photo.media.id);
  expect(await finishJob(tx,image,poster(image.mediaId))).toBe(true);
  expect(await finishJob(tx,encoding,{...poster(encoding.mediaId),playbackKey:`derivatives/${encoding.mediaId}/play.mp4`})).toBe(true);
  expect((await listMedia(db,father,clip.id))[0]).toMatchObject({status:'ready',hasPreview:true,hasPlayback:true});
  const linked=(await listMedia(db,father,clip.id,true))[0];
  const signed=verifyTicket(new URL(linked.playback!.url).searchParams.get('ticket')!);
  expect(signed).toMatchObject({operation:'get',mime:'video/mp4',key:`derivatives/${encoding.mediaId}/play.mp4`,expires:linked.playback!.expiresAt});
  expect(await listMedia(db,other,clip.id,true)).toEqual([]);
  expect((await listMedia(db,father,photo.id,true))[0].playback).toBeUndefined();
 });
 it('过期转码仍由视频队列回收，旧租约不能回写或覆盖封面',async()=>{
  await event('video');const first=(await claimJob(tx,'preview'))!;
  await finishPreviewJob(tx,first,poster(first.mediaId));const old=(await claimJob(tx,'video'))!;
  await db.query("update momentnest.media_jobs set lease_until=clock_timestamp()-interval '1 second' where media_id=$1",[old.mediaId]);
  expect(await claimJob(tx,'preview')).toBeNull();
  const next=(await claimJob(tx,'video'))!;expect(next.token).not.toBe(old.token);
  expect(await finishPreviewJob(tx,first,poster(first.mediaId))).toBe(false);
  expect(await finishJob(tx,old,poster(old.mediaId))).toBe(false);
  await finishJob(tx,{...next,attempts:3},null);
  const row=(await db.query('select status,preview_key from momentnest.media where id=$1',[next.mediaId])).rows[0];
  expect(row).toEqual({status:'failed',preview_key:poster(next.mediaId).previewKey});
 });
 it('过期封面任务由新租约接管，提交旧封面无效',async()=>{
  await event('video');const old=(await claimJob(tx,'preview'))!;
  await db.query("update momentnest.media_jobs set lease_until=clock_timestamp()-interval '1 second' where media_id=$1",[old.mediaId]);
  const next=(await claimJob(tx,'preview'))!;
  expect(await finishPreviewJob(tx,old,poster(old.mediaId))).toBe(false);
  expect(await finishPreviewJob(tx,next,poster(next.mediaId))).toBe(true);
 });
 it('列表直接附带私有签名封面；批量刷新只有一次成员校验且隔离家庭',async()=>{
  const ours=await event(),theirs=await event('image',other);
  const j=(await claimJob(tx,'preview'))!;expect(j.mediaId).toBe(ours.media.id);await finishJob(tx,j,poster(j.mediaId));
  const queries:string[]=[];const counted={query:async(sql:string,args?:unknown[])=>{queries.push(sql);return db.query<Record<string,unknown>>(sql,args);}};
  const page=await listEvents(counted,father,undefined,undefined,true);expect(queries).toHaveLength(2);
  const cover=page.items.find(e=>e.id===ours.id)!.cover!;
  const gallery=page.items.find(e=>e.id===ours.id)!.media!;expect(gallery.map(m=>m.id)).toEqual([ours.media.id]);expect(gallery[0].preview).toBeDefined();expect(gallery[0]).not.toHaveProperty('object_key');expect(gallery[0]).not.toHaveProperty('metadata');
  expect(cover.hasPreview).toBe(true);expect(cover.preview?.srcSet).toContain('960w');
  const signed=verifyTicket(new URL(cover.preview!.url).searchParams.get('ticket')!);
  expect(signed).toMatchObject({operation:'get',mime:'image/jpeg',key:poster(j.mediaId).previewKey});
  expect(signed.expires).toBe(cover.preview!.expiresAt);
  expect(cover).not.toHaveProperty('metadata');expect(cover).not.toHaveProperty('object_key');
  queries.length=0;
  const covers=await listEventCovers(counted,father,[ours.id,theirs.id],true);
  expect(queries).toHaveLength(2);expect(covers.map(e=>e.eventId)).toEqual([ours.id]);expect(covers[0].media.map(m=>m.id)).toEqual([ours.media.id]);expect(covers[0].media[0].preview).toBeDefined();
  await db.query('update momentnest.members set active=false where auth_user_id=$1',[father]);
  try{await expect(listEventCovers(db,father,[ours.id],true)).rejects.toMatchObject({code:'FORBIDDEN'});}
  finally{await db.query('update momentnest.members set active=true where auth_user_id=$1',[father]);}
 });
 it('空闲时为旧预览补齐480/960版本，worker现有权限足够且不修改原预览',async()=>{
  const e=await event();const p=poster(e.media.id).previewKey;
  await mkdir(dirname(objectPath(p)),{recursive:true});
  await sharp({create:{width:1920,height:1280,channels:3,background:'#557744'}}).jpeg().toFile(objectPath(p));
  const bytes=await readFile(objectPath(p));
  await db.query("update momentnest.media set status='ready',preview_key=$1,metadata='{}' where id=$2",[p,e.media.id]);
  await db.query("update momentnest.media_jobs set state='ready' where media_id=$1",[e.media.id]);
  await db.exec('set role momentnest_worker');
  try{expect(await backfillPreview(tx)).toBe(true);expect(await backfillPreview(tx)).toBe(false);}
  finally{await db.exec('reset role');}
  const row=(await db.query<Record<string,unknown>>('select * from momentnest.media where id=$1',[e.media.id])).rows[0];
  const sizes=previewSizes(row.metadata as Record<string,unknown>);expect(sizes.map(s=>s.width)).toEqual([480,960,1920]);
  for(const s of sizes)expect((await sharp(objectPath(s.key)).metadata()).width).toBe(s.width);
  expect(await readFile(objectPath(p))).toEqual(bytes);expect(row.status).toBe('ready');
 });
 it('旧素材仍可签发预览，队列提示区分排队与实际处理',()=>{
  const links=previewLinks({preview_key:'derivatives/legacy.jpg',metadata:{}})!;
  expect(links.url).toContain('/object?ticket=');expect(links.srcSet).toBeUndefined();
  const media={status:'pending',kind:'video',hasPreview:false} as Parameters<typeof mediaStatusText>[0];
  expect(mediaStatusText(media)).toBe('原件已保存，等待处理');
  expect(mediaStatusText({...media,status:'processing'})).toBe('正在生成视频封面');
  expect(mediaStatusText({...media,hasPreview:true,status:'processing'})).toBe('封面已生成，正在生成播放版');
 });
});

import {describe,it,expect,vi} from 'vitest';
import {UploadQueue} from '../src/domain/upload-queue';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('bounded upload scheduling',()=>{
 it('prioritizes small files without interrupting transfers already running',async()=>{
  const queue=new UploadQueue(1),started:string[]=[],done=new Map<string,()=>void>();
  const add=(key:string,size:number)=>queue.add(key,()=>new Promise<void>(resolve=>{started.push(key);done.set(key,resolve);}),size);
  add('large',100);add('photo',5);add('small',1);await flush();expect(started).toEqual(['small']);
  add('later',2);done.get('small')!();await flush();expect(started).toEqual(['small','later']);
  done.get('later')!();await flush();expect(started).toEqual(['small','later','photo']);
  done.get('photo')!();await flush();expect(started).toEqual(['small','later','photo','large']);done.get('large')!();await flush();
 });
 it('starts two files immediately and fills free slots across later selections',async()=>{
  const queue=new UploadQueue(2),started:string[]=[],done=new Map<string,()=>void>();
  const add=(key:string)=>queue.add(key,()=>new Promise<void>(resolve=>{started.push(key);done.set(key,resolve);}));
  add('a');add('b');add('c');await flush();expect(started).toEqual(['a','b']);
  add('d');done.get('b')!();await flush();expect(started).toEqual(['a','b','c']);
  done.get('a')!();await flush();expect(started).toEqual(['a','b','c','d']);
  done.get('c')!();done.get('d')!();await flush();
 });
 it('allows three concurrent transfers but never starts a third video',async()=>{
  const queue=new UploadQueue({limit:3,videoLimit:2}),started:string[]=[],done=new Map<string,()=>void>();
  const add=(key:string,kind:'image'|'video')=>queue.add(key,()=>new Promise<void>(resolve=>{started.push(key);done.set(key,resolve);}),0,kind);
  add('video-a','video');add('video-b','video');add('video-c','video');add('photo-a','image');await flush();
  expect(started).toEqual(['video-a','video-b','photo-a']);
  done.get('video-a')!();await flush();expect(started).toEqual(['video-a','video-b','photo-a','video-c']);
  done.get('video-b')!();done.get('photo-a')!();done.get('video-c')!();await flush();
 });
 it('does not block following photos when one fails; retries never double-run',async()=>{
  const queue=new UploadQueue(1),run=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
  queue.add('a',run);queue.add('a',run);const next=vi.fn(async()=>{});queue.add('b',next);
  await flush();expect(run).toHaveBeenCalledTimes(1);expect(next).toHaveBeenCalledOnce();
  queue.add('a',run);await flush();expect(run).toHaveBeenCalledTimes(2);
 });
 it('removed and unmounted queued files never start uploading',async()=>{
  const queue=new UploadQueue(1);let finish!:()=>void;
  queue.add('active',()=>new Promise<void>(resolve=>{finish=resolve;}));
  await flush();
  const removed=vi.fn(async()=>{}),pending=vi.fn(async()=>{});
  queue.add('removed',removed);queue.add('pending',pending);
  queue.remove('removed');queue.clear();await flush();finish();await flush();
  expect(removed).not.toHaveBeenCalled();expect(pending).not.toHaveBeenCalled();
 });
});

import {describe,it,expect,vi} from 'vitest';
import {UploadQueue} from '../src/domain/upload-queue';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('bounded upload scheduling',()=>{
 it('starts two files immediately and fills free slots across later selections',async()=>{
  const queue=new UploadQueue(2),started:string[]=[],done=new Map<string,()=>void>();
  const add=(key:string)=>queue.add(key,()=>new Promise<void>(resolve=>{started.push(key);done.set(key,resolve);}));
  add('a');add('b');add('c');await flush();expect(started).toEqual(['a','b']);
  add('d');done.get('b')!();await flush();expect(started).toEqual(['a','b','c']);
  done.get('a')!();await flush();expect(started).toEqual(['a','b','c','d']);
  done.get('c')!();done.get('d')!();await flush();
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
  const removed=vi.fn(async()=>{}),pending=vi.fn(async()=>{});
  queue.add('removed',removed);queue.add('pending',pending);
  queue.remove('removed');queue.clear();await flush();finish();await flush();
  expect(removed).not.toHaveBeenCalled();expect(pending).not.toHaveBeenCalled();
 });
});

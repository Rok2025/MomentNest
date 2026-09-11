import {afterEach,describe,expect,it,vi} from 'vitest';
import {monitorUploads,uploadDiagnosticSchema} from '../src/domain/upload-diagnostic';

afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function environment(){
 vi.useFakeTimers();const saved=new Map<string,string>();
 const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true}));
 vi.stubGlobal('window',win);vi.stubGlobal('document',doc);vi.stubGlobal('navigator',{onLine:true});
 vi.stubGlobal('performance',{getEntriesByType:()=>[{type:'reload'}]});
 vi.stubGlobal('sessionStorage',{getItem:(k:string)=>saved.get(k)||null,setItem:(k:string,v:string)=>saved.set(k,v)});
 vi.stubGlobal('fetch',fetcher);
 return {saved,win,doc,fetcher,payload:()=>JSON.parse(fetcher.mock.calls.at(-1)![1].body)};
}
describe('upload page diagnostics',()=>{
 it('records counts and navigation without retaining private file data',()=>{
  const e=environment(),stop=monitorUploads('member',()=>[{status:'uploading',name:'private.jpg',blob:new Blob(['secret'])},{status:'failed'}]);
  expect(e.payload().current).toMatchObject({count:2,active:1,failed:1,navigation:'reload',discarded:null});
  expect(JSON.stringify(e.payload())).not.toMatch(/private|secret|blob/);
  expect(uploadDiagnosticSchema.safeParse(e.payload()).success).toBe(true);stop();
 });
 it('records visibility and pagehide; next mount includes prior snapshot without calling it a crash',()=>{
  const e=environment(),stop=monitorUploads('member',()=>[{status:'verified'}]);
  e.doc.visibilityState='hidden';e.doc.dispatchEvent(new Event('visibilitychange'));
  expect(e.payload().current.event).toBe('hidden');
  e.win.dispatchEvent(new Event('pagehide'));expect(e.payload().current.event).toBe('pagehide');
  const previous=e.saved.get('momentnest:upload-diagnostic:member')!;stop();
  e.saved.set('momentnest:upload-diagnostic:member',previous);
  const stop2=monitorUploads('member',()=>[]);expect(e.payload().previous.event).toBe('pagehide');stop2();
 });
 it('survives storage/network failure and removes listeners and heartbeat on unmount',async()=>{
  const e=environment();e.fetcher.mockRejectedValue(Error('offline'));
  vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error();},setItem:()=>{throw Error();}});
  const stop=monitorUploads('member',()=>[{status:'uploading'}]);
  await vi.advanceTimersByTimeAsync(15000);expect(e.fetcher).toHaveBeenCalledTimes(2);
  stop();const n=e.fetcher.mock.calls.length;e.win.dispatchEvent(new Event('offline'));
  await vi.advanceTimersByTimeAsync(30000);expect(e.fetcher).toHaveBeenCalledTimes(n);
 });
 it('rejects injected filenames, freeform errors and oversized counts',()=>{
  const e=environment(),stop=monitorUploads('member',()=>[]);const data=e.payload();
  expect(uploadDiagnosticSchema.safeParse({...data,filename:'secret.jpg'}).success).toBe(false);
  expect(uploadDiagnosticSchema.safeParse({current:{...data.current,count:1000}}).success).toBe(true);
  expect(uploadDiagnosticSchema.safeParse({current:{...data.current,count:1001}}).success).toBe(false);
  expect(uploadDiagnosticSchema.safeParse({current:{...data.current,error:'token=secret'}}).success).toBe(false);stop();
 });
});

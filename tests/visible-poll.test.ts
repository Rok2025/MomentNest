import { afterEach,beforeEach,it,expect,vi } from 'vitest';
import { pollWhileVisible } from '../src/domain/visible-poll';
import { reusePreview,type MediaRecord } from '../src/domain/media';
let page:EventTarget&{hidden:boolean};
beforeEach(()=>{vi.useFakeTimers();page=Object.assign(new EventTarget(),{hidden:false});vi.stubGlobal('document',page);});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('隐藏页暂停，返回立即同步，慢请求不重叠且卸载取消',async()=>{
 let release:()=>void=()=>{};let signal:AbortSignal|undefined;
 const run=vi.fn((s:AbortSignal)=>{signal=s;return new Promise<void>(resolve=>{release=resolve;});});
 const stop=pollWhileVisible(run);
 await vi.advanceTimersByTimeAsync(6000);expect(run).toHaveBeenCalledTimes(1);
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
 page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(18000);expect(run).toHaveBeenCalledTimes(1);
 release();await vi.advanceTimersByTimeAsync(0);
 page.hidden=true;page.dispatchEvent(new Event('visibilitychange'));
 await vi.advanceTimersByTimeAsync(12000);expect(run).toHaveBeenCalledTimes(1);
 page.hidden=false;page.dispatchEvent(new Event('visibilitychange'));expect(run).toHaveBeenCalledTimes(2);
 stop();expect(signal!.aborted).toBe(true);release();await vi.advanceTimersByTimeAsync(12000);expect(run).toHaveBeenCalledTimes(2);
});
it('状态轮询复用有效封面URL，过期或派生版本变化时替换',()=>{
 const previous={id:'a',preview:{url:'old',revision:'r1',expiresAt:90000}} as MediaRecord;
 const incoming={id:'a',preview:{url:'new',revision:'r1',expiresAt:100000}} as MediaRecord;
 expect(reusePreview(previous,incoming,1000).preview).toBe(previous.preview);
 expect(reusePreview(previous,incoming,80000).preview).toBe(incoming.preview);
 expect(reusePreview(previous,{...incoming,preview:{...incoming.preview!,revision:'r2'}},1000).preview?.url).toBe('new');
});

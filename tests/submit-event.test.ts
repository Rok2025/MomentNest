import {afterEach,describe,it,expect,vi} from 'vitest';
import {submitEvent} from '../src/domain/submit-event';
const input={requestKey:'attempt-1',title:'',body:'一段文字',feeling:'',occurredOn:'2025-08-01',uploadIds:['existing-upload'],uploadDates:[{id:'existing-upload',occurredOn:'2025-07-31'}]};
afterEach(()=>vi.unstubAllGlobals());
describe('metadata-only save request',()=>{
 it('只发送一次轻量JSON，保留文件编号和各自日期',async()=>{
  const fetcher=vi.fn().mockResolvedValue(Response.json({ok:true,id:'event-id'}));vi.stubGlobal('fetch',fetcher);
  expect(await submitEvent(input)).toEqual({ok:true,id:'event-id'});
  expect(fetcher).toHaveBeenCalledOnce();const [url,options]=fetcher.mock.calls[0];
  expect(url).toBe('/api/events/save');expect(options.method).toBe('POST');expect(options.headers['Content-Type']).toBe('application/json');
  expect(JSON.parse(options.body)).toEqual(input);expect(options.body.length).toBeLessThan(1024);
 });
 it('保留认证和冲突错误，未确认的响应不能当成保存成功',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({ok:false,code:'UNAUTHENTICATED',message:'请重新登录'},{status:401}))
   .mockResolvedValueOnce(Response.json({ok:false,code:'CONFLICT',message:'已被修改'},{status:409}))
   .mockResolvedValueOnce(Response.json({ok:true}))
   .mockRejectedValueOnce(Error('network interrupted'));
  vi.stubGlobal('fetch',fetcher);
  expect(await submitEvent(input)).toMatchObject({code:'UNAUTHENTICATED'});expect(await submitEvent(input)).toMatchObject({code:'CONFLICT'});
  await expect(submitEvent(input)).rejects.toThrow('尚未确认');await expect(submitEvent(input)).rejects.toThrow('network interrupted');
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(fetcher.mock.calls.every(([,options])=>JSON.parse(options.body).requestKey===input.requestKey)).toBe(true);
 });
});

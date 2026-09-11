import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DomainError} from '../src/domain/events';
const mocks=vi.hoisted(()=>({identity:vi.fn(),update:vi.fn(),own:vi.fn()}));
vi.mock('../src/server/db',()=>({database:()=>({}),transaction:vi.fn()}));
vi.mock('../src/server/auth/session',()=>({requireIdentity:mocks.identity}));
vi.mock('../src/server/media-store',()=>({updateMediaCaptureTime:mocks.update,ownMedia:mocks.own,mediaRecord:(row:unknown)=>row}));
import {GET,PATCH} from '../src/app/api/media/[id]/capture-time/route';
const id='00000000-0000-4000-8000-000000000001';
const context={params:Promise.resolve({id})};
const body={capturedTime:'2025-07-26T19:27:16',expectedOverride:null};
const request=(origin=process.env.APP_URL||'http://localhost:3000')=>new Request(`http://localhost:3000/api/media/${id}/capture-time`,{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();mocks.identity.mockResolvedValue('member');mocks.update.mockResolvedValue({id,...body});mocks.own.mockResolvedValue({id});});
describe('capture-time HTTP boundary',()=>{
 it('authenticates each read and save, returning private uncached metadata',async()=>{
  const get=await GET(new Request('http://localhost:3000'),context);expect(get.status).toBe(200);expect(get.headers.get('cache-control')).toBe('private, no-store');
  const patch=await PATCH(request(),context);expect(patch.status).toBe(200);expect(mocks.update.mock.calls[0].slice(1)).toEqual(['member',id,body]);
 });
 it('rejects cross-origin writes before reaching the store',async()=>{
  expect((await PATCH(request('https://other.example'),context)).status).toBe(403);expect(mocks.update).not.toHaveBeenCalled();
 });
 it('rejects anonymous reads and writes',async()=>{
  mocks.identity.mockRejectedValue(new DomainError('UNAUTHENTICATED','请登录'));
  expect((await GET(new Request('http://localhost:3000'),context)).status).toBe(401);expect((await PATCH(request(),context)).status).toBe(401);expect(mocks.update).not.toHaveBeenCalled();
 });
 it('rejects malformed IDs and reports save conflicts without leaking SQL errors',async()=>{
  expect((await PATCH(request(),{params:Promise.resolve({id:'bad'})})).status).toBe(400);
  mocks.update.mockRejectedValue(new DomainError('CONFLICT','时间已更新'));expect((await PATCH(request(),context)).status).toBe(409);
  mocks.update.mockRejectedValue(Error('private database internals'));const response=await PATCH(request(),context);expect(response.status).toBe(503);expect(await response.text()).not.toContain('private database internals');
 });
});

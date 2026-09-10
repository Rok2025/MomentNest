import {afterEach,describe,expect,it,vi} from 'vitest';
const identity=vi.hoisted(()=>vi.fn());
const member=vi.hoisted(()=>vi.fn());
vi.mock('../src/server/auth/session',()=>({requireIdentity:identity}));
vi.mock('../src/server/event-store',()=>({memberFor:member}));
vi.mock('../src/server/db',()=>({database:()=>({})}));
import {POST} from '../src/app/api/uploads/diagnostics/route';
import {DomainError} from '../src/domain/events';
afterEach(()=>vi.restoreAllMocks());
const payload={current:{pageId:'11111111-1111-4111-8111-111111111111',documentId:'22222222-2222-4222-8222-222222222222',at:1,event:'mount',count:0,active:0,failed:0,verified:0,visible:true,online:true,navigation:'reload',discarded:null}};
function req(body:unknown=payload,origin=process.env.APP_URL||'http://localhost:3000'){
 return new Request('http://localhost:3000/api/uploads/diagnostics',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
}
describe('private diagnostic ingestion',()=>{
 it('requires valid origin and login before accepting a report',async()=>{
  identity.mockRejectedValue(new DomainError('UNAUTHENTICATED','login required'));
  expect((await POST(req(payload,'https://attacker.example'))).status).toBe(403);
  expect((await POST(req())).status).toBe(401);
 });
 it('enforces size and schema, then records only bounded data for a live member',async()=>{
  identity.mockResolvedValue('test-member-1');member.mockResolvedValue({id:'member-1'});
  const log=vi.spyOn(console,'info').mockImplementation(()=>{});
  expect((await POST(req({private:'x'.repeat(5000)}))).status).toBe(413);
  expect((await POST(req({...payload,filename:'private.jpg'}))).status).toBe(400);
  expect(log).not.toHaveBeenCalled();
  expect((await POST(req())).status).toBe(200);
  expect(JSON.parse(log.mock.calls[0][1])).toEqual({memberId:'member-1',...payload});
 });
 it('limits report rate and rejects inactive membership',async()=>{
  identity.mockResolvedValue('test-member-2');member.mockRejectedValue(new DomainError('FORBIDDEN','inactive'));
  expect((await POST(req())).status).toBe(403);
  member.mockResolvedValue({id:'member-2'});vi.spyOn(console,'info').mockImplementation(()=>{});
  for(let i=0;i<29;i++)expect((await POST(req())).status).toBe(200);
  expect((await POST(req())).status).toBe(429);
 });
});

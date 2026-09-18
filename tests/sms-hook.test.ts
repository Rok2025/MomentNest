import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Webhook } from 'standardwebhooks';

const mocked=vi.hoisted(()=>({send:vi.fn(),member:vi.fn()}));
vi.mock('../src/server/db',()=>({database:()=>({})}));
vi.mock('../src/server/event-store',()=>({memberFor:mocked.member}));
vi.mock('../src/server/auth/sms',()=>({sendVerificationSms:mocked.send}));
import { POST } from '../src/app/api/auth/sms/route';

const secret=Buffer.alloc(32,7).toString('base64');
const user={id:'00000000-0000-4000-8000-000000000001',phone:'8613800138000'};
function request(payload:unknown,date=new Date()){
 const body=JSON.stringify(payload),id='test-hook';
 return new Request('http://localhost/api/auth/sms',{method:'POST',body,headers:{
  'webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),
  'webhook-signature':new Webhook(secret).sign(id,date,body),
 }});
}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('SUPABASE_SMS_HOOK_SECRET',`v1,whsec_${secret}`);mocked.member.mockResolvedValue({id:'member'});mocked.send.mockResolvedValue(undefined);});
afterEach(()=>vi.unstubAllEnvs());
describe('Supabase SMS hook',()=>{
 it('sends a signed member OTP through the Tencent adapter',async()=>{
  expect((await POST(request({user,sms:{otp:'123456'}}))).status).toBe(200);
  expect(mocked.send).toHaveBeenCalledExactlyOnceWith('+8613800138000','123456');
 });
 it('uses the new number for first binding rather than an empty phone',async()=>{
  expect((await POST(request({user:{...user,phone:'',new_phone:'8613900139000'},sms:{otp:'123456'}}))).status).toBe(200);
  expect(mocked.send).toHaveBeenCalledWith('+8613900139000','123456');
 });
 it('prefers the explicit sms recipient over pending profile data',async()=>{
  await POST(request({user:{...user,new_phone:'8613900139000'},sms:{otp:'123456',phone:user.phone}}));
  expect(mocked.send).toHaveBeenCalledWith('+8613800138000','123456');
 });
 it('rejects unsigned and tampered requests before any database or SMS calls',async()=>{
  const original=request({user,sms:{otp:'123456'}});
  const altered=new Request(original.url,{method:'POST',headers:original.headers,body:JSON.stringify({user,sms:{otp:'654321'}})});
  expect((await POST(altered)).status).toBe(401);
  expect((await POST(new Request(original.url,{method:'POST',body:'{}'}))).status).toBe(401);
  expect(mocked.member).not.toHaveBeenCalled();expect(mocked.send).not.toHaveBeenCalled();
 });
 it('rejects expired signatures',async()=>{
  expect((await POST(request({user,sms:{otp:'123456'}},new Date(Date.now()-600000)))).status).toBe(401);
  expect(mocked.send).not.toHaveBeenCalled();
 });
 it('refuses to send for nonmembers even with a valid Auth signature',async()=>{
  mocked.member.mockRejectedValue(Error('FORBIDDEN'));
  expect((await POST(request({user,sms:{otp:'123456'}}))).status).toBe(503);
  expect(mocked.send).not.toHaveBeenCalled();
 });
 it('fails closed without configuration',async()=>{
  vi.stubEnv('SUPABASE_SMS_HOOK_SECRET','');
  expect((await POST(request({user,sms:{otp:'123456'}}))).status).toBe(503);
  expect(mocked.send).not.toHaveBeenCalled();
 });
 it('does not leak credentials, phone or OTP on delivery failure',async()=>{
  mocked.send.mockRejectedValue(Error('secret 13800138000 123456'));
  const response=await POST(request({user,sms:{otp:'123456'}}));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/secret|13800138000|123456/);
 });
});

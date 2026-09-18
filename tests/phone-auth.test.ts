import { beforeEach,describe,expect,it,vi } from 'vitest';

const mocked=vi.hoisted(()=>({getUser:vi.fn(),updateUser:vi.fn(),signInWithOtp:vi.fn(),verifyOtp:vi.fn(),signOut:vi.fn(),memberFor:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('../src/server/auth/client',()=>({authClient:async()=>({auth:mocked})}));
vi.mock('../src/server/db',()=>({database:()=>({})}));
vi.mock('../src/server/event-store',()=>({memberFor:mocked.memberFor}));
import { sendPhoneCode,verifyPhoneCode } from '../src/app/actions/phone';
import { phoneSchema,maskPhone } from '../src/domain/phone';

const id='00000000-0000-4000-8000-000000000001';
const memberId='00000000-0000-4000-8000-000000000002';
const phone='13800138000';
const confirmed={id,phone:`86${phone}`,phone_confirmed_at:'2026-09-18T00:00:00Z'};
beforeEach(()=>{
 vi.resetAllMocks();
 mocked.getUser.mockResolvedValue({data:{user:{id,new_phone:`86${phone}`}},error:null});
 mocked.memberFor.mockResolvedValue({id:memberId});
 mocked.updateUser.mockResolvedValue({error:null});
 mocked.signInWithOtp.mockResolvedValue({error:null});
 mocked.verifyOtp.mockResolvedValue({data:{user:confirmed},error:null});
 mocked.signOut.mockResolvedValue({error:null});
});
describe('phone OTP authentication',()=>{
 it.each([phone,`+86${phone}`,`86${phone}`,'138 0013 8000'])('normalizes %s without duplicating the country code',value=>{
  expect(phoneSchema.parse(value)).toBe(`+86${phone}`);
  expect(maskPhone(`86${phone}`)).toBe('138****8000');
 });
 it('never registers a new user while requesting a login code',async()=>{
  expect((await sendPhoneCode({phone,bind:false})).ok).toBe(true);
  expect(mocked.signInWithOtp).toHaveBeenCalledExactlyOnceWith({phone:`+86${phone}`,options:{shouldCreateUser:false}});
  expect(mocked.updateUser).not.toHaveBeenCalled();
 });
 it('binds the phone on the authenticated member rather than creating an account',async()=>{
  expect((await sendPhoneCode({phone,bind:true})).ok).toBe(true);
  expect(mocked.memberFor).toHaveBeenCalledWith({},id);
  expect(mocked.updateUser).toHaveBeenCalledWith({phone:`+86${phone}`});
  expect(mocked.signInWithOtp).not.toHaveBeenCalled();
 });
 it('rejects binding when unauthenticated or outside the family',async()=>{
  mocked.getUser.mockResolvedValueOnce({data:{user:null},error:null});
  expect((await sendPhoneCode({phone,bind:true})).ok).toBe(false);
  mocked.memberFor.mockRejectedValueOnce(Error('FORBIDDEN'));
  expect((await sendPhoneCode({phone,bind:true})).ok).toBe(false);
  expect(mocked.updateUser).not.toHaveBeenCalled();
 });
 it('does not offer replacement of an already verified phone',async()=>{
  mocked.getUser.mockResolvedValue({data:{user:confirmed},error:null});
  expect((await sendPhoneCode({phone:'13900139000',bind:true})).ok).toBe(false);
  expect((await verifyPhoneCode({phone,code:'123456',bind:true})).ok).toBe(false);
  expect(mocked.updateUser).not.toHaveBeenCalled();expect(mocked.verifyOtp).not.toHaveBeenCalled();
 });
 it('confirms binding with phone_change and preserves the original identity',async()=>{
  expect((await verifyPhoneCode({phone,code:'123456',bind:true})).ok).toBe(true);
  expect(mocked.verifyOtp).toHaveBeenCalledWith({phone:`+86${phone}`,token:'123456',type:'phone_change'});
  expect(mocked.signOut).not.toHaveBeenCalled();
 });
 it('rejects binding a number that is not pending on the current user',async()=>{
  expect((await verifyPhoneCode({phone:'13900139000',code:'123456',bind:true})).ok).toBe(false);
  expect(mocked.verifyOtp).not.toHaveBeenCalled();
 });
 it('logs in with sms OTP and validates the editor’s expected member',async()=>{
  expect((await verifyPhoneCode({phone,code:'123456',bind:false,expectedMemberId:memberId})).ok).toBe(true);
  expect(mocked.verifyOtp).toHaveBeenCalledWith({phone:`+86${phone}`,token:'123456',type:'sms'});
  expect(mocked.getUser).not.toHaveBeenCalled();
 });
 it('clears the new session if a different parent logs into an existing editor',async()=>{
  expect((await verifyPhoneCode({phone,code:'123456',bind:false,expectedMemberId:id})).ok).toBe(false);
  expect(mocked.signOut).toHaveBeenCalledWith({scope:'local'});
 });
 it('clears a session that has no active family membership',async()=>{
  mocked.memberFor.mockRejectedValue(Error('FORBIDDEN'));
  expect((await verifyPhoneCode({phone,code:'123456',bind:false})).ok).toBe(false);
  expect(mocked.signOut).toHaveBeenCalled();
 });
 it('rejects an unexpected identity returned by binding verification',async()=>{
  mocked.verifyOtp.mockResolvedValue({data:{user:{...confirmed,id:memberId}},error:null});
  expect((await verifyPhoneCode({phone,code:'123456',bind:true})).ok).toBe(false);
  expect(mocked.signOut).toHaveBeenCalled();
 });
 it('reports expired or incorrect codes without exposing internal errors',async()=>{
  mocked.verifyOtp.mockResolvedValue({data:{user:null},error:{message:'private',status:403}});
  const result=await verifyPhoneCode({phone,code:'123456',bind:false});
  expect(result).toEqual({ok:false,message:'验证码错误或已过期，请重试'});
 });
 it('rejects invalid input before calling the provider',async()=>{
  expect((await sendPhoneCode({phone:'invalid',bind:false})).ok).toBe(false);
  expect((await verifyPhoneCode({phone,code:'12',bind:false})).ok).toBe(false);
  expect(mocked.signInWithOtp).not.toHaveBeenCalled();expect(mocked.verifyOtp).not.toHaveBeenCalled();
 });
 it('reports provider throttling instead of claiming successful delivery',async()=>{
  mocked.signInWithOtp.mockResolvedValue({error:{status:429}});
  expect(await sendPhoneCode({phone,bind:false})).toEqual({ok:false,message:'验证码请求过于频繁，请稍后再试'});
 });
});

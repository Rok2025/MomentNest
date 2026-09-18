import { beforeEach,describe,expect,it,vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocked=vi.hoisted(()=>({createServerClient:vi.fn(),send:vi.fn(),verify:vi.fn()}));
vi.mock('@supabase/ssr',()=>({createServerClient:mocked.createServerClient}));
vi.mock('../src/server/config',()=>({appUrl:()=> 'https://nest.rokzhang.cn',authConfig:()=>({url:'https://example.supabase.co',key:'publishable-key'})}));
vi.mock('../src/server/auth/phone',()=>({sendPhoneCodeWithAuth:mocked.send,verifyPhoneCodeWithAuth:mocked.verify}));
import { POST } from '../src/app/api/auth/phone/route';

function request(body:unknown,origin='https://nest.rokzhang.cn'){
 return new NextRequest('https://nest.rokzhang.cn/api/auth/phone',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
}
beforeEach(()=>{
 vi.resetAllMocks();
 mocked.createServerClient.mockImplementation((_url:string,_key:string,options:{cookies:{setAll:(cookies:Array<{name:string;value:string;options:Record<string,unknown>}>)=>void}})=>{
  options.cookies.setAll([{name:'sb-session',value:'updated',options:{httpOnly:true,path:'/'}}]);
  return {auth:{}};
 });
 mocked.send.mockResolvedValue({ok:true,message:'验证码已发送'});
 mocked.verify.mockResolvedValue({ok:true,message:'登录成功'});
});
describe('phone auth route',()=>{
 it('uses a stable same-origin endpoint and forwards the Supabase session cookie',async()=>{
  const response=await POST(request({operation:'verify',phone:'13800138000',code:'123456',bind:false}));
  expect(await response.json()).toEqual({ok:true,message:'登录成功'});
  expect(response.headers.get('set-cookie')).toContain('sb-session=updated');
  expect(response.headers.get('x-request-id')).toMatch(/^[a-zA-Z0-9_-]{8,80}$/);
  expect(mocked.createServerClient).toHaveBeenCalledWith('https://example.supabase.co','publishable-key',expect.objectContaining({global:{fetch:expect.any(Function)}}));
  expect(mocked.verify).toHaveBeenCalledWith({operation:'verify',phone:'13800138000',code:'123456',bind:false},expect.any(Function),expect.any(String));
 });
 it('rejects cross-origin calls before they reach Supabase',async()=>{
  const response=await POST(request({operation:'send',phone:'13800138000',bind:false},'https://attacker.invalid'));
  expect(await response.json()).toEqual({ok:false,message:'请求来源无效，请刷新页面后重试'});
  expect(mocked.createServerClient).not.toHaveBeenCalled();
  expect(mocked.send).not.toHaveBeenCalled();
 });
});

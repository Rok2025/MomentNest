import { createServerClient } from '@supabase/ssr';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl,authConfig } from '@/server/config';
import { sendPhoneCodeWithAuth,verifyPhoneCodeWithAuth,type PhoneAuthClient } from '@/server/auth/phone';
import type { AuthResult } from '@/domain/events';

export const runtime='nodejs';

const requestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('send'),phone:z.string(),bind:z.boolean()}),
 z.object({operation:z.literal('verify'),phone:z.string(),code:z.string(),bind:z.boolean(),expectedMemberId:z.string().optional()}),
]);
const unavailable:AuthResult={ok:false,message:'验证码服务暂不可用，请稍后重试'};
function resultResponse(result:AuthResult,cookieResponse:NextResponse){
 const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 for(const cookie of cookieResponse.cookies.getAll())response.cookies.set(cookie);
 return response;
}
function logUnexpectedFailure(error:unknown){
 console.error(JSON.stringify({event:'phone_auth_route_failure',errorType:error instanceof Error?error.name:'unknown'}));
}
export async function POST(request:NextRequest){
 const cookieResponse=NextResponse.next();
 try{
  if(request.headers.get('origin')!==appUrl())return resultResponse({ok:false,message:'请求来源无效，请刷新页面后重试'},cookieResponse);
  const parsed=requestSchema.safeParse(await request.json());
  if(!parsed.success)return resultResponse({ok:false,message:'请求格式无效，请刷新页面后重试'},cookieResponse);
  const {url,key}=authConfig();
  const auth=createServerClient(url,key,{cookieOptions:{httpOnly:true,sameSite:'lax',secure:appUrl().startsWith('https://'),path:'/'},cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll:values=>{for(const {name,value,options} of values)cookieResponse.cookies.set(name,value,options);},
  }}) as PhoneAuthClient;
  const result=parsed.data.operation==='send'
   ?await sendPhoneCodeWithAuth(parsed.data,async()=>auth)
   :await verifyPhoneCodeWithAuth(parsed.data,async()=>auth);
  return resultResponse(result,cookieResponse);
 }catch(error){logUnexpectedFailure(error);return resultResponse(unavailable,cookieResponse);}
}

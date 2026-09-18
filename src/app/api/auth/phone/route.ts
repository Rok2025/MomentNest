import { createServerClient } from '@supabase/ssr';
import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { appUrl,authConfig } from '@/server/config';
import { sendPhoneCodeWithAuth,verifyPhoneCodeWithAuth,type PhoneAuthClient } from '@/server/auth/phone';
import type { AuthResult } from '@/domain/events';

export const runtime='nodejs';
const upstreamTimeoutMs=12_000;

const requestSchema=z.discriminatedUnion('operation',[
 z.object({operation:z.literal('send'),phone:z.string(),bind:z.boolean()}),
 z.object({operation:z.literal('verify'),phone:z.string(),code:z.string(),bind:z.boolean(),expectedMemberId:z.string().optional()}),
]);
function requestIdFor(request:NextRequest){
 const candidate=request.headers.get('x-request-id');
 return candidate&&/^[a-zA-Z0-9_-]{8,80}$/.test(candidate)?candidate:crypto.randomUUID();
}
function timedFetch(input:RequestInfo|URL,init?:RequestInit){
 return fetch(input,{...init,signal:AbortSignal.timeout(upstreamTimeoutMs)});
}
function unavailable(operation:'send'|'verify'|undefined):AuthResult{
 return {ok:false,message:operation==='send'?'短信服务暂不可用，请稍后重试':'验证码服务暂不可用，请稍后重试'};
}
function resultResponse(result:AuthResult,cookieResponse:NextResponse,requestId:string){
 const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store','X-Request-ID':requestId}});
 for(const cookie of cookieResponse.cookies.getAll())response.cookies.set(cookie);
 return response;
}
function logUnexpectedFailure(requestId:string,error:unknown){
 console.error(JSON.stringify({event:'phone_auth_route_failure',requestId,errorType:error instanceof Error?error.name:'unknown'}));
}
export async function POST(request:NextRequest){
 const requestId=requestIdFor(request),cookieResponse=NextResponse.next();
 let operation:'send'|'verify'|undefined;
 try{
  if(request.headers.get('origin')!==appUrl())return resultResponse({ok:false,message:'请求来源无效，请刷新页面后重试'},cookieResponse,requestId);
  const parsed=requestSchema.safeParse(await request.json());
  if(!parsed.success)return resultResponse({ok:false,message:'请求格式无效，请刷新页面后重试'},cookieResponse,requestId);
  operation=parsed.data.operation;
  const {url,key}=authConfig();
  const auth=createServerClient(url,key,{global:{fetch:timedFetch},cookieOptions:{httpOnly:true,sameSite:'lax',secure:appUrl().startsWith('https://'),path:'/'},cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll:values=>{for(const {name,value,options} of values)cookieResponse.cookies.set(name,value,options);},
  }}) as PhoneAuthClient;
  const result=parsed.data.operation==='send'
   ?await sendPhoneCodeWithAuth(parsed.data,async()=>auth,requestId)
   :await verifyPhoneCodeWithAuth(parsed.data,async()=>auth,requestId);
  return resultResponse(result,cookieResponse,requestId);
 }catch(error){logUnexpectedFailure(requestId,error);return resultResponse(unavailable(operation),cookieResponse,requestId);}
}

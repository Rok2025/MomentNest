import 'server-only';

import { z } from 'zod';
import type { authClient } from './client';
import { database } from '@/server/db';
import { memberFor } from '@/server/event-store';
import { phoneSchema,phoneCodeSchema } from '@/domain/phone';
import type { AuthResult } from '@/domain/events';

export type PhoneAuthClient=Awaited<ReturnType<typeof authClient>>;
export type PhoneAuthFactory=()=>Promise<PhoneAuthClient>;

const unavailable:AuthResult={ok:false,message:'短信服务暂不可用，请稍后重试'};
function logProviderFailure(stage:string,error:{status?:number;code?:string},requestId?:string){
 console.error(JSON.stringify({event:'phone_auth_provider_failure',stage,requestId,status:error.status,code:error.code}));
}
function sendFailure(error:{status?:number;code?:string},requestId?:string):AuthResult{
 logProviderFailure('send',error,requestId);
 return error.status===429||error.code?.includes('rate_limit')
  ?{ok:false,message:'验证码请求过于频繁，请稍后再试'}:unavailable;
}
function logUnexpectedFailure(stage:string,error:unknown,requestId?:string){
 // Provider messages may include a phone number or OTP, so logs keep only a category.
 console.error(JSON.stringify({event:'phone_auth_unexpected_failure',stage,requestId,errorType:error instanceof Error?error.name:'unknown'}));
}
async function bindingAccount(auth:PhoneAuthClient){
 const {data,error}=await auth.auth.getUser();
 if(error||!data.user)throw Error('UNAUTHENTICATED');
 await memberFor(database(),data.user.id);
 return data.user;
}
export async function sendPhoneCodeWithAuth(input:{phone:string;bind:boolean},createAuth:PhoneAuthFactory,requestId?:string):Promise<AuthResult>{
 const parsed=z.object({phone:phoneSchema,bind:z.boolean()}).safeParse(input);
 if(!parsed.success)return {ok:false,message:'请输入有效的中国大陆手机号'};
 try{
  const auth=await createAuth();
  if(parsed.data.bind){
   const user=await bindingAccount(auth);
   if(user.phone&&user.phone_confirmed_at)return {ok:false,message:'此账号已绑定手机号'};
   const {error}=await auth.auth.updateUser({phone:parsed.data.phone});
   if(error)return sendFailure(error,requestId);
  }else{
   const {error}=await auth.auth.signInWithOtp({phone:parsed.data.phone,options:{shouldCreateUser:false}});
   if(error)return sendFailure(error,requestId);
  }
  return {ok:true,message:parsed.data.bind?'验证码已发送':'如果手机号已绑定，验证码将发送到你的手机'};
 }catch(error){logUnexpectedFailure('send',error,requestId);return unavailable;}
}
export async function verifyPhoneCodeWithAuth(input:{phone:string;code:string;bind:boolean;expectedMemberId?:string},createAuth:PhoneAuthFactory,requestId?:string):Promise<AuthResult>{
 const parsed=z.object({phone:phoneSchema,code:phoneCodeSchema,bind:z.boolean(),expectedMemberId:z.uuid().optional()}).safeParse(input);
 if(!parsed.success)return {ok:false,message:'请输入有效手机号和 6 位验证码'};
 try{
  const auth=await createAuth();
  const user=parsed.data.bind?await bindingAccount(auth):null;
  if(user?.phone&&user.phone_confirmed_at)return {ok:false,message:'此账号已绑定手机号'};
  if(user&&phoneSchema.safeParse(user.new_phone).data!==parsed.data.phone)return {ok:false,message:'请先为此手机号获取绑定验证码'};
  const {data,error}=await auth.auth.verifyOtp({phone:parsed.data.phone,token:parsed.data.code,type:parsed.data.bind?'phone_change':'sms'});
  if(error||!data.user){if(error)logProviderFailure('verify',error,requestId);return {ok:false,message:error?.status===429?'验证过于频繁，请稍后重试':'验证码错误或已过期，请重试'};}
  try{
   if(user&&user.id!==data.user.id)throw Error('WRONG_ACCOUNT');
   if(!data.user.phone_confirmed_at||phoneSchema.safeParse(data.user.phone).data!==parsed.data.phone)throw Error('PHONE_NOT_CONFIRMED');
   const member=await memberFor(database(),data.user.id);
   if(parsed.data.expectedMemberId&&member.id!==parsed.data.expectedMemberId)throw Error('WRONG_MEMBER');
  }catch{
   try{await auth.auth.signOut({scope:'local'});}catch(error){logUnexpectedFailure('sign_out_after_rejected_verification',error,requestId);}
   return {ok:false,message:'请使用原家庭成员账号登录'};
  }
  return {ok:true,message:parsed.data.bind?'手机号已绑定，可使用验证码登录':'登录成功'};
 }catch(error){logUnexpectedFailure('verify',error,requestId);return unavailable;}
}

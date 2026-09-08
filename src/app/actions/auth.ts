'use server';
import { z } from 'zod';
import { authClient } from '@/server/auth/client';
import { appUrl } from '@/server/config';
import { database } from '@/server/db';
import { memberFor } from '@/server/event-store';
import type { AuthResult } from '@/domain/events';
export async function loginAction(_prev:AuthResult,form:FormData):Promise<AuthResult> {
  const parsed=z.object({email:z.email(),password:z.string().min(1).max(200),expectedMemberId:z.string().uuid().optional()}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {ok:false,message:'请输入有效邮箱和密码'};
  try{
    const auth=await authClient();const {data,error}=await auth.auth.signInWithPassword({email:parsed.data.email,password:parsed.data.password});
    if(error||!data.user)return {ok:false,message:'邮箱或密码不正确，请重试'};
    try{const member=await memberFor(database(),data.user.id);if(parsed.data.expectedMemberId&&member.id!==parsed.data.expectedMemberId)throw new Error("WRONG_MEMBER");}catch{await auth.auth.signOut();return {ok:false,message:'此账号尚未加入家庭，或记录服务尚未就绪'};}
    return {ok:true,message:'登录成功'};
  }catch{return {ok:false,message:'登录服务尚未就绪，请检查服务配置或稍后重试'};}
}
export async function logoutAction():Promise<AuthResult> {
  try{const auth=await authClient();const {error}=await auth.auth.signOut({scope:'local'});if(error)return {ok:false,message:'退出失败，请重试'};return {ok:true,message:'已退出'};}
  catch{return {ok:false,message:'退出失败，请重试'};}
}
export async function forgotAction(_prev:AuthResult,form:FormData):Promise<AuthResult> {
  const email=z.email().safeParse(form.get('email'));
  if(!email.success)return {ok:false,message:'请输入有效邮箱'};
  try{const auth=await authClient();await auth.auth.resetPasswordForEmail(email.data,{redirectTo:`${appUrl()}/auth/callback?next=/reset-password`});}
  catch{/* Uniform result avoids account enumeration. */}
  return {ok:true,message:'如果这个邮箱可以恢复账号，你将收到重置邮件。请检查收件箱。'};
}
export async function resetAction(_prev:AuthResult,form:FormData):Promise<AuthResult> {
  const password=z.string().min(12).max(128).safeParse(form.get('password'));
  if(!password.success||password.data!==form.get('confirm'))return {ok:false,message:'请输入至少12位的新密码，并保持两次一致'};
  try{
    const auth=await authClient();const {data}=await auth.auth.getUser();
    if(!data.user)return {ok:false,message:'恢复链接已过期，请重新申请'};
    await memberFor(database(),data.user.id);
    const {error}=await auth.auth.updateUser({password:password.data});
    if(error)return {ok:false,message:'密码更新失败，请检查密码要求或重新申请链接'};
    await auth.auth.signOut({scope:'local'});
    return {ok:true,message:'密码已更新，请重新登录'};
  }catch{return {ok:false,message:'恢复服务暂不可用，请稍后重试'};}
}

// Called only after the recipient explicitly accepts the email link in the browser.
export async function acceptEmailSession(input:{access_token:string;refresh_token:string}):Promise<AuthResult>{
  const parsed=z.object({access_token:z.string().min(1).max(16384),refresh_token:z.string().min(1).max(4096)}).safeParse(input);
  if(!parsed.success)return {ok:false,message:'链接无效，请重新申请。'};
  try{
    const auth=await authClient();
    const verified=await auth.auth.getUser(parsed.data.access_token);
    if(verified.error||!verified.data.user)return {ok:false,message:'链接已过期，请重新申请。'};
    await memberFor(database(),verified.data.user.id);
    const result=await auth.auth.setSession(parsed.data);
    if(result.error||result.data.user?.id!==verified.data.user.id){await auth.auth.signOut({scope:'local'});return {ok:false,message:'链接验证失败，请重新申请。'};}
    return {ok:true,message:'链接已验证'};
  }catch{return {ok:false,message:'账号尚未加入家庭或链接暂不可用，请稍后重试。'};}
}

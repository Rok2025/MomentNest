import 'server-only';
import { redirect } from 'next/navigation';
import { appConfigured } from './config';
import { requireIdentity } from './auth/session';
import { database } from './db';
import { memberFor } from './event-store';
import { DomainError } from '@/domain/events';
export async function pageContext(){
  if(!appConfigured())return {ok:false as const,message:'还差一步：请先完成服务配置，再开始保存回忆。'};
  let authId:string;
  try{authId=await requireIdentity();}catch(error){if(error instanceof DomainError&&error.code==='UNAUTHENTICATED')redirect('/login');return {ok:false as const,message:'登录服务暂不可用，请稍后重试。'};}
  try{return {ok:true as const,authId,member:await memberFor(database(),authId)};}catch{return {ok:false as const,message:'此账号尚未加入家庭，或记录服务尚未就绪。'};}
}

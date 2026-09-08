import { ZodError } from 'zod';
import { DomainError, type SaveResult } from '@/domain/events';
export function failure(error: unknown): Exclude<SaveResult,{ok:true}> {
  if(error instanceof DomainError) return {ok:false,code:error.code,message:error.message};
  if(error instanceof ZodError) return {ok:false,code:'VALIDATION',message:error.issues[0]?.message||'请检查输入'};
  // Never return provider errors/SQL messages: they may contain credentials or personal data.
  return {ok:false,code:'UNAVAILABLE',message:'暂时无法连接记录服务。你的输入仍保留，请稍后重试。'};
}

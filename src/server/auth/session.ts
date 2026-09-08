import 'server-only';
import { DomainError } from '@/domain/events';
import { authClient } from './client';
export async function requireIdentity() {
  const auth=await authClient();
  const {data,error}=await auth.auth.getUser();
  if(error||!data.user) throw new DomainError('UNAUTHENTICATED','登录已过期，请重新登录；你的输入仍保留');
  return data.user.id;
}

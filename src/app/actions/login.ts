'use server';
import { redirect, RedirectType } from 'next/navigation';
import { loginAction } from './auth';
import type { AuthResult } from '../../domain/events';

// Redirect as part of the action, before React commits a reset login form.
// The editor uses loginAction directly so reauthentication preserves its draft.
export async function loginPageAction(previous:AuthResult,form:FormData):Promise<AuthResult>{
  const result=await loginAction(previous,form);
  if(result.ok)redirect('/',RedirectType.replace);
  return result;
}

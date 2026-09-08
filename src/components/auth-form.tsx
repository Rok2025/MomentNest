'use client';
import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginAction,resetAction } from '@/app/actions/auth';
import type { AuthResult } from '@/domain/events';
const initial:AuthResult={ok:false,message:''};
export function AuthForm({mode='login',onSuccess,expectedMemberId}:{mode?:'login'|'reset';onSuccess?:()=>void;expectedMemberId?:string}){
  const router=useRouter();
  const action=mode==='login'?loginAction:resetAction;
  const [state,submit,pending]=useActionState(action,initial);
  useEffect(()=>{
    if(!state.ok)return;
    if(mode==='reset'){router.replace('/login?reset=success');return;}
    if(onSuccess)onSuccess();else {router.replace('/');router.refresh();}
  },[state,mode,onSuccess,router]);
  if(mode==='reset'&&state.ok)return <p role="status">密码已更新，正在前往登录页… <Link href="/login?reset=success">立即登录</Link></p>;
  return <form action={submit} className="form-stack">
    {mode==='reset'&&<><h1>设置新密码</h1><p className="muted">设置至少 12 位的新密码，两次输入需一致。</p></>}
    {expectedMemberId&&<input type="hidden" name="expectedMemberId" value={expectedMemberId}/>}
    {mode!=='reset'&&<label>邮箱<input required name="email" type="email" autoComplete="email" inputMode="email"/></label>}
    <label>{mode==='reset'?'新密码':'密码'}<input required name="password" type="password" minLength={mode==='reset'?12:1} maxLength={128} autoComplete={mode==='reset'?'new-password':'current-password'}/></label>
    {mode==='reset'&&<label>再次输入新密码<input required name="confirm" type="password" minLength={12} autoComplete="new-password"/></label>}
    <button disabled={pending} className="primary">{pending?'请稍候…':mode==='login'?'登录':'更新密码'}</button>
    <p aria-live="polite" role={state.ok?'status':'alert'}>{state.message}</p>
    {mode==='login'?<Link href="/forgot-password" target={onSuccess?'_blank':undefined}>忘记密码</Link>:<Link href="/login">回到登录</Link>}
  </form>;
}

'use client';
import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { loginAction,resetAction } from '@/app/actions/auth';
import { loginPageAction } from '@/app/actions/login';
import type { AuthResult } from '@/domain/events';
const initial:AuthResult={ok:false,message:''};
export function AuthForm({mode='login',onSuccess,expectedMemberId}:{mode?:'login'|'reset';onSuccess?:()=>void;expectedMemberId?:string}){
  const router=useRouter();
  const [email,setEmail]=useState('');
  const action=mode==='login'?(onSuccess?loginAction:loginPageAction):resetAction;
  const [state,submit,pending]=useActionState(action,initial);
  useEffect(()=>{
    if(!state.ok)return;
    if(mode==='reset'){router.replace('/login?reset=success');return;}
    onSuccess?.();
  },[state,mode,onSuccess,router]);
  if(mode==='reset'&&state.ok)return <p role="status">密码已更新，正在前往登录页… <Link href="/login?reset=success">立即登录</Link></p>;
  if(mode==='login'&&state.ok)return <p role="status">登录成功，正在继续…</p>;
  return <form action={submit} className="form-stack" aria-busy={pending}>
    <fieldset disabled={pending}>
    {mode==='reset'&&<><h1>设置新密码</h1><p className="muted">设置至少 12 位的新密码，两次输入需一致。</p></>}
    {expectedMemberId&&<input type="hidden" name="expectedMemberId" value={expectedMemberId}/>}
    {mode!=='reset'&&<label>邮箱<input required name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={event=>setEmail(event.target.value)}/></label>}
    <label>{mode==='reset'?'新密码':'密码'}<input required name="password" type="password" minLength={mode==='reset'?12:1} maxLength={128} autoComplete={mode==='reset'?'new-password':'current-password'}/></label>
    {mode==='reset'&&<label>再次输入新密码<input required name="confirm" type="password" minLength={12} autoComplete="new-password"/></label>}
    <button disabled={pending} className="primary">{pending?(mode==='login'?'正在登录…':'正在更新…'):mode==='login'?'登录':'更新密码'}</button>
    </fieldset>
    <p aria-live="polite" role={pending||state.ok?'status':'alert'}>{pending?(mode==='login'?'正在验证账号并进入，请稍候…':'正在更新密码，请稍候…'):state.message}</p>
    {mode==='login'?<Link href="/forgot-password" target={onSuccess?'_blank':undefined}>忘记密码</Link>:<Link href="/login">回到登录</Link>}
  </form>;
}

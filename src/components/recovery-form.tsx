'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { forgotAction } from '@/app/actions/auth';
import type { AuthResult } from '@/domain/events';

const initial:AuthResult={ok:false,message:''};

export function RecoveryForm(){
  const [email,setEmail]=useState('');
  const [submittedEmail,setSubmittedEmail]=useState('');
  const [editing,setEditing]=useState(true);
  const [showFeedback,setShowFeedback]=useState(false);
  const [remaining,setRemaining]=useState(0);
  const deadline=useRef(0);
  const heading=useRef<HTMLHeadingElement>(null);
  const flow=useRef<HTMLDivElement>(null);
  const [state,submit,pending]=useActionState(async(prev:AuthResult,form:FormData)=>{
    const address=String(form.get('email')??'').trim();
    let result:AuthResult;
    try {result=await forgotAction(prev,form);}
    catch {result={ok:false,message:'请求未完成，请检查网络后重试。'};}
    deadline.current=Date.now()+60_000;
    setRemaining(60);
    setShowFeedback(true);
    if(result.ok){setSubmittedEmail(address);setEditing(false);}
    return result;
  },initial);
  useEffect(()=>{
    const timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((deadline.current-Date.now())/1000))),1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{if(!editing){heading.current?.focus({preventScroll:true});flow.current?.scrollIntoView({block:'start'});}},[editing,state]);
  const confirmed=!editing;
  return <div className="recovery-flow" ref={flow}>
    <p className="eyebrow">恢复账号 · {confirmed?'第二步 / 查收邮件':'第一步 / 确认邮箱'}</p>
    {confirmed?<>
      <div className="auth-result-icon" aria-hidden="true">✉</div>
      <h1 ref={heading} tabIndex={-1}>请查收恢复邮件</h1>
      <p>若此邮箱已受邀，恢复链接会发送至：</p>
      <p className="recovery-address">{submittedEmail}</p>
      <ol className="recovery-steps">
        <li>打开邮箱，查找密码恢复邮件，也请检查垃圾邮件。</li>
        <li>在当前浏览器中打开邮件链接，设置新密码。</li>
        <li>返回 时光记，使用新密码登录。</li>
      </ol>
      <p className="muted">邮件可能需要几分钟送达。只使用最新邮件中的链接。</p>
    </>:<><h1>找回密码</h1><p className="muted">输入邀请时使用的邮箱，我们会发送设置新密码的链接。</p></>}
    <form action={submit} className="form-stack">
      {confirmed?<input name="email" type="hidden" value={submittedEmail}/>:<label>邮箱<input required name="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={event=>setEmail(event.target.value)} readOnly={pending} placeholder="输入受邀邮箱"/></label>}
      {showFeedback&&state.message&&<p className={state.ok&&confirmed?'sr-only':state.ok?'notice':'auth-error'} role={state.ok?'status':'alert'}>{state.message}</p>}
      <button disabled={pending||remaining>0} className={confirmed?'':'primary'}>{pending?'正在提交…':state.retryLimited?'稍后重试':remaining>0?`${remaining} 秒后可重新发送`:confirmed?'重新发送邮件':'发送恢复邮件'}</button>
      {confirmed&&<button type="button" disabled={pending} onClick={()=>{setEditing(true);setShowFeedback(false);}}>修改邮箱</button>}
      <Link className="recovery-back" href="/login">返回登录</Link>
    </form>
  </div>;
}

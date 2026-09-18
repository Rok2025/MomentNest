'use client';

import { useEffect,useId,useState } from 'react';
import { useRouter } from 'next/navigation';
import { phoneSchema } from '@/domain/phone';
import type { AuthResult } from '@/domain/events';

type PhoneRequest={operation:'send';phone:string;bind:boolean}|{operation:'verify';phone:string;code:string;bind:boolean;expectedMemberId?:string};
async function phoneRequest(input:PhoneRequest):Promise<AuthResult>{
 const response=await fetch('/api/auth/phone',{method:'POST',headers:{'Content-Type':'application/json','X-Request-ID':crypto.randomUUID()},cache:'no-store',credentials:'same-origin',body:JSON.stringify(input)});
 if(!response.headers.get('content-type')?.includes('application/json'))throw Error('PHONE_AUTH_RESPONSE_INVALID');
 const result:unknown=await response.json();
 if(!result||typeof result!=='object'||typeof (result as AuthResult).ok!=='boolean'||typeof (result as AuthResult).message!=='string')throw Error('PHONE_AUTH_RESPONSE_INVALID');
 return result as AuthResult;
}

export function PhoneAuthForm({bind=false,onSuccess,expectedMemberId}:{bind?:boolean;onSuccess?:()=>void;expectedMemberId?:string}){
 const id=useId(),router=useRouter();
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[sentPhone,setSentPhone]=useState('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[message,setMessage]=useState('');
 const [refreshRequired,setRefreshRequired]=useState(false);
 const [deadline,setDeadline]=useState(0),[seconds,setSeconds]=useState(0);
 useEffect(()=>{
  if(!deadline)return;
  const tick=()=>setSeconds(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
  tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
 },[deadline]);
 async function send(){
  setBusy(true);setMessage('');setRefreshRequired(false);
  try{
   const result=await phoneRequest({operation:'send',phone,bind});setMessage(result.message);
   if(result.ok){setSentPhone(phone);setCode('');setSeconds(60);setDeadline(Date.now()+60000);}
  }catch{setMessage('登录请求未完成。请不要重复获取验证码；如已收到短信，可先输入最近收到的一组验证码。');setRefreshRequired(true);}finally{setBusy(false);}
 }
 async function verify(){
  setBusy(true);setMessage('');setRefreshRequired(false);
  try{
   const result=await phoneRequest({operation:'verify',phone,code,bind,expectedMemberId});
   setMessage(result.message);
   if(result.ok){setDone(true);if(onSuccess)onSuccess();else if(!bind){router.replace('/');router.refresh();}}
  }catch{setMessage('登录请求未完成。请不要重复获取验证码；如已收到短信，可先输入最近收到的一组验证码。');setRefreshRequired(true);}finally{setBusy(false);}
 }
 if(done)return <p role="status">{message}</p>;
 return <form className="form-stack" action={verify} aria-busy={busy}>
  <fieldset disabled={busy}>
   <div className="phone-code-request"><label htmlFor={`${id}-phone`}>手机号<input id={`${id}-phone`} type="tel" autoComplete="tel" inputMode="tel" required value={phone} placeholder="手机号码" onChange={event=>{setPhone(event.target.value);setSentPhone('');setCode('');setMessage('');}}/></label>
   <button className="code-request" type="button" disabled={busy||seconds>0||!phoneSchema.safeParse(phone).success} onClick={()=>void send()}>{seconds>0?`${seconds} 秒后重发`:'获取验证码'}</button></div>
   <label htmlFor={`${id}-code`}>验证码<input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} placeholder="6 位短信验证码"/></label>
   <button className="primary login-submit" disabled={busy||sentPhone!==phone||!sentPhone||code.length!==6}>{busy?'正在处理…':bind?'确认绑定':'登录'}</button>
  </fieldset>
  <p role="status" aria-live="polite">{message}</p>
  {refreshRequired&&<button type="button" onClick={()=>window.location.reload()}>刷新页面</button>}
 </form>;
}

'use client';

import { useEffect,useId,useState } from 'react';
import { sendPhoneCode,verifyPhoneCode } from '@/app/actions/phone';
import { useRouter } from 'next/navigation';
import { phoneSchema } from '@/domain/phone';

export function PhoneAuthForm({bind=false,onSuccess,expectedMemberId}:{bind?:boolean;onSuccess?:()=>void;expectedMemberId?:string}){
 const id=useId(),router=useRouter();
 const [phone,setPhone]=useState(''),[code,setCode]=useState(''),[sentPhone,setSentPhone]=useState('');
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[message,setMessage]=useState('');
 const [deadline,setDeadline]=useState(0),[seconds,setSeconds]=useState(0);
 useEffect(()=>{
  if(!deadline)return;
  const tick=()=>setSeconds(Math.max(0,Math.ceil((deadline-Date.now())/1000)));
  tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);
 },[deadline]);
 async function send(){
  setBusy(true);setMessage('');
  try{
   const result=await sendPhoneCode({phone,bind});setMessage(result.message);
   if(result.ok){setSentPhone(phone);setCode('');setSeconds(60);setDeadline(Date.now()+60000);}
  }catch{setMessage('暂时无法发送验证码，请稍后重试');}finally{setBusy(false);}
 }
 async function verify(){
  setBusy(true);setMessage('');
  try{
   const result=await verifyPhoneCode({phone,code,bind,expectedMemberId});
   setMessage(result.message);
   if(result.ok){setDone(true);if(onSuccess)onSuccess();else if(!bind){router.replace('/');router.refresh();}}
  }catch{setMessage('暂时无法验证，请稍后重试');}finally{setBusy(false);}
 }
 if(done)return <p role="status">{message}</p>;
 return <form className="form-stack" action={verify} aria-busy={busy}>
  <fieldset disabled={busy}>
   <label htmlFor={`${id}-phone`}>手机号<input id={`${id}-phone`} type="tel" autoComplete="tel" inputMode="tel" required value={phone} placeholder="中国大陆手机号" onChange={event=>{setPhone(event.target.value);setSentPhone('');setCode('');setMessage('');}}/></label>
   <button type="button" disabled={busy||seconds>0||!phoneSchema.safeParse(phone).success} onClick={()=>void send()}>{seconds>0?`${seconds} 秒后重发`:'获取验证码'}</button>
   <label htmlFor={`${id}-code`}>验证码<input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,''))} placeholder="6 位短信验证码"/></label>
   <button className="primary" disabled={busy||sentPhone!==phone||!sentPhone||code.length!==6}>{busy?'正在处理…':bind?'确认绑定':'登录'}</button>
  </fieldset>
  <p role="status" aria-live="polite">{message}</p>
 </form>;
}

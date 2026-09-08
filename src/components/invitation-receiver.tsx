'use client';
import { useEffect, useRef, useState } from 'react';
import { acceptEmailSession } from '@/app/actions/auth';

// Default Supabase invitation emails use a fragment, which the server cannot read.
// Remove it from browser history immediately; never persist or log these tokens.
export function InvitationReceiver(){
  const tokens=useRef<{access_token:string;refresh_token:string}|null>(null);
  const [status,setStatus]=useState('');
  const [pending,setPending]=useState(false);
  useEffect(()=>{
    const p=new URLSearchParams(window.location.hash.slice(1));
    const access=p.get('access_token'),refresh=p.get('refresh_token');
    if(!access||!refresh)return;
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
    if(p.get('type')!=='invite'&&p.get('type')!=='recovery')return;
    tokens.current={access_token:access,refresh_token:refresh};
    // Synchronize the external browser URL after hydration; never read tokens during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('已收到邀请或恢复链接，请继续设置密码。');
  },[]);
  async function accept(){
    if(!tokens.current||pending)return;
    setPending(true);
    try{const result=await acceptEmailSession(tokens.current);if(result.ok){tokens.current=null;window.location.replace('/reset-password');return;}setStatus(result.message);}
    catch{setStatus('链接处理失败，请重新打开邮件或申请恢复链接。');}
    finally{setPending(false);}
  }
  if(!status)return null;
  return <section className="notice"><p role="status">{status}</p><button type="button" disabled={pending} onClick={accept}>{pending?'正在验证…':'继续设置密码'}</button></section>;
}

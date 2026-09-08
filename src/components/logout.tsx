'use client';
import { useState } from 'react';
import { logoutAction } from '@/app/actions/auth';
export function Logout(){const [busy,setBusy]=useState(false),[error,setError]=useState('');return <div><button disabled={busy} onClick={async()=>{setBusy(true);const result=await logoutAction();if(result.ok){for(const key of Object.keys(sessionStorage))if(key.startsWith('momentnest:'))sessionStorage.removeItem(key);window.location.replace('/login');}else{setError(result.message);setBusy(false);}}}>退出</button>{error&&<small role="alert">{error}</small>}</div>;}

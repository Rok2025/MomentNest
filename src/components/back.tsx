'use client';
import Link from 'next/link';
export function Back({memberId}:{memberId:string}){return <Link href="/" onClick={e=>{try{const saved=JSON.parse(sessionStorage.getItem(`momentnest:view:${memberId}`)||'null');if(!saved)return;const url=new URL(saved.url,location.origin);if(url.origin!==location.origin||url.pathname!=='/')return;e.preventDefault();window.location.assign(url.pathname+url.search+'#'+encodeURIComponent(saved.anchor||''));}catch{}}}>← 回到时间线</Link>;}

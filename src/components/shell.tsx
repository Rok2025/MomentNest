import Link from 'next/link';
import { Logout } from './logout';
import type { ReactNode } from 'react';
export function Header({label,age,actions}:{label?:string;age?:ReactNode;actions?:ReactNode}){return <header className="topbar"><div className="brand-group"><Link className="brand" href="/">拾光记</Link>{age}</div>{actions&&<div className="header-actions">{actions}</div>}<nav aria-label="账号">{label&&<span className="member-badge" aria-label={`当前登录：${label}`} title={`当前登录：${label}`}><span className="member-avatar" aria-hidden="true">{label.slice(0,1)}</span><strong>{label}</strong></span>}{label?<Logout/>:<Link href="/login">登录</Link>}</nav></header>;}
export function Unavailable({message}:{message:string}){return <><Header/><section className="panel empty"><p className="eyebrow">私密成长手账</p><h1>让值得记住的小事，有个家。</h1><p>{message}</p><p className="muted">当前没有写入任何示例记录。</p><Link className="button primary" href="/login">前往登录</Link></section></>;}

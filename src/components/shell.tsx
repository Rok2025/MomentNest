import Link from 'next/link';
import { Logout } from './logout';
export function Header({label}:{label?:string}){return <header className="topbar"><Link className="brand" href="/">MomentNest<span>又又的成长手账</span></Link><nav>{label&&<span>{label}</span>}{label?<Logout/>:<Link href="/login">登录</Link>}</nav></header>;}
export function Unavailable({message}:{message:string}){return <><Header/><section className="panel empty"><p className="eyebrow">私密成长手账</p><h1>让值得记住的小事，有个家。</h1><p>{message}</p><p className="muted">当前没有写入任何示例记录。</p><Link className="button primary" href="/login">前往登录</Link></section></>;}

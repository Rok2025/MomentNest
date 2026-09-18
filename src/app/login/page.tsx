import { InvitationReceiver } from '@/components/invitation-receiver';
import { AuthForm } from '@/components/auth-form';
import { Header } from '@/components/shell';
import { authConfigured } from '@/server/config';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string;reset?:string}>}){const {error,reset}=await searchParams;return <div className="login-page"><Header hideLogin/><section className="login-shell"><section className="auth panel login-card" aria-labelledby="login-title"><div className="login-intro"><p className="eyebrow">欢迎回家</p><h1 id="login-title">又又的日常</h1><p className="muted">和爸爸妈妈一起，把小事慢慢留下</p></div>{!authConfigured()&&<p className="notice" role="status">登录服务尚未配置，请先完成环境设置。</p>}{error&&<p role="alert">链接无效或已过期，请重新申请恢复邮件。</p>}{reset==='success'&&!error&&<p className="notice" role="status">密码已更新，请使用新密码登录。</p>}<InvitationReceiver/><AuthForm/><p className="login-access-note">仅受邀的爸爸妈妈账号可登录</p></section></section></div>;}

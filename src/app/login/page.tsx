import { InvitationReceiver } from '@/components/invitation-receiver';
import { AuthForm } from '@/components/auth-form';
import { Header } from '@/components/shell';
import { authConfigured } from '@/server/config';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){const {error}=await searchParams;return <><Header/><section className="auth panel"><p className="eyebrow">欢迎回家</p><h1>一起留下又又的日常</h1><p className="muted">仅爸爸妈妈受邀账号可用</p>{!authConfigured()&&<p className="notice" role="status">登录服务尚未配置，请先完成环境设置。</p>}{error&&<p role="alert">链接无效或已过期，请重新申请恢复邮件。</p>}<InvitationReceiver/><AuthForm/></section></>;}

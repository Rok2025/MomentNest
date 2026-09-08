import { AuthForm } from '@/components/auth-form';
import { Header } from '@/components/shell';
export default function Forgot(){return <><Header/><section className="auth panel"><h1>找回密码</h1><p>输入邀请时使用的邮箱。</p><AuthForm mode="forgot"/></section></>;}

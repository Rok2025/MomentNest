import { AuthForm } from '@/components/auth-form';
import { Header } from '@/components/shell';
export default function Reset(){return <><Header/><section className="auth panel"><h1>设置新密码</h1><p>请从邀请或恢复邮件中的链接进入。</p><AuthForm mode="reset"/></section></>;}

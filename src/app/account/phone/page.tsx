import Link from 'next/link';
import { Header,Unavailable } from '@/components/shell';
import { PhoneAuthForm } from '@/components/phone-auth-form';
import { pageContext } from '@/server/page-context';
import { authClient } from '@/server/auth/client';
import { maskPhone } from '@/domain/phone';

export const dynamic='force-dynamic';
export default async function PhonePage(){
 const context=await pageContext();
 if(!context.ok)return <Unavailable message={context.message}/>;
 const {data,error}=await (await authClient()).auth.getUser();
 if(error||!data.user)return <Unavailable message="登录已过期，请重新登录"/>;
 const phone=data.user.phone_confirmed_at?data.user.phone:null;
 return <><Header label={context.member.label}/><section className="auth panel"><Link href="/">← 回到时间线</Link><h1>绑定手机号</h1>
  {phone?<p>已绑定 {maskPhone(phone)}，可以使用短信验证码登录。</p>:<><p className="muted">绑定后，用手机号和短信验证码即可登录当前账号。</p><PhoneAuthForm bind/></>}
 </section></>;
}

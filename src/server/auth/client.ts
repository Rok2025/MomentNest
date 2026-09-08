import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authConfig } from '../config';
export async function authClient() {
  const {url,key}=authConfig(), jar=await cookies();
  return createServerClient(url,key,{cookieOptions:{httpOnly:true,sameSite:'lax',secure:process.env.APP_URL?.startsWith('https://')??false,path:'/'},cookies:{
    getAll:()=>jar.getAll(),
    setAll:values=>{try {for(const {name,value,options} of values) jar.set(name,value,options);}catch{/* Server Components read cookies; proxy refreshes them. */}},
  }});
}

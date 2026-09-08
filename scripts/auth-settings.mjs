// Optional operator tool. Reads current settings by default; --apply changes only this project's auth settings.
const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;
if(!ref||!token){console.log('SUPABASE_ACCESS_TOKEN unavailable; no Auth settings changed.');process.exit(2);}
const endpoint=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
try{
 const apply=process.argv.includes('--apply');
 const origin=new URL(process.env.APP_URL||'http://localhost:3000').origin;
 const res=await fetch(endpoint,{method:apply?'PATCH':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(apply?{body:JSON.stringify({disable_signup:true,site_url:origin,uri_allow_list:`${origin}/auth/callback,${origin}/auth/confirm,${origin}/reset-password`})}:{})});
 if(!res.ok)throw new Error('AUTH_CONFIG_FAILED');
 const data=await res.json();console.log(JSON.stringify({ok:true,applied:apply,publicSignupDisabled:data.disable_signup===true}));
}catch{console.log('Auth configuration request failed; details withheld.');process.exitCode=1;}

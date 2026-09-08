// Explicit operator step; never run from the public application. No credentials or email are logged.
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { createInterface } from 'node:readline/promises';
const url=process.env.SUPABASE_URL,adminKey=process.env.SUPABASE_AUTH_ADMIN_KEY,connection=process.env.MIGRATION_DATABASE_URL;
const target=process.env.SUPABASE_PROJECT_REF;
if(!target||!url||new URL(url).hostname!==`${target}.supabase.co`||!adminKey||!connection?.includes(target)){
 console.log('Missing target-specific admin/SQL configuration; nothing changed.');process.exit(2);
}
const rl=createInterface({input:process.stdin,output:process.stdout});
const email=(await rl.question('爸爸登录邮箱（不写日志或文件）：')).trim();rl.close();
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){console.log('Invalid email; nothing changed.');process.exit(2);}
const dbUrl=new URL(connection);for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])dbUrl.searchParams.delete(k);
const pool=new Pool({connectionString:dbUrl.toString(),max:1,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true}});
const auth=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
let invited=false;
try{
 await pool.query('select 1 from momentnest.households limit 1');
 let user;
 for(let page=1;page<=10;page++){
  const {data,error}=await auth.auth.admin.listUsers({page,perPage:100});if(error)throw error;
  user=data.users.find(u=>u.email?.toLowerCase()===email.toLowerCase());if(user||data.users.length<100)break;
 }
 if(!user){const {data,error}=await auth.auth.admin.inviteUserByEmail(email,{redirectTo:`${process.env.APP_URL||'http://localhost:3000'}/auth/callback?next=/reset-password`});if(error||!data.user)throw new Error('INVITE_FAILED');user=data.user;invited=true;}
 const db=await pool.connect();
 try{
  await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('momentnest-bootstrap',0))");
  const homes=await db.query('select id from momentnest.households');
  if(homes.rows.length>1)throw new Error('AMBIGUOUS_HOUSEHOLD');
  const household=homes.rows[0]?.id||(await db.query("insert into momentnest.households(name) values('MomentNest') returning id")).rows[0].id;
  await db.query('insert into momentnest.subjects(household_id) values($1) on conflict(household_id) do nothing',[household]);
  const existing=await db.query("select auth_user_id from momentnest.members where household_id=$1 and label='爸爸'",[household]);
  if(existing.rows.length&&existing.rows[0].auth_user_id!==user.id)throw new Error('FATHER_ALREADY_MAPPED');
  await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸') on conflict(auth_user_id) do nothing",[household,user.id]);
  await db.query('commit');console.log('Father account mapped. No mother account was created.');
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
}catch{console.log(invited?'Invitation sent but mapping incomplete; rerun after fixing configuration.':'Onboarding failed; inspect configuration safely. No details logged.');process.exitCode=1;}
finally{await pool.end();}

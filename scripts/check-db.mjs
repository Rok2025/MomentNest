import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
const ref=process.env.SUPABASE_PROJECT_REF;
if(!ref||!process.env.DATABASE_URL){console.log(JSON.stringify({ok:false,reason:'DATABASE_URL_NOT_CONFIGURED'}));process.exit(2);}
const url=new URL(process.env.DATABASE_URL);
const username=decodeURIComponent(url.username);
if(!process.env.DATABASE_URL.includes(ref)||username==='postgres'||username.startsWith('postgres.')){console.log(JSON.stringify({ok:false,reason:'WRONG_PROJECT_OR_ADMIN_ROLE'}));process.exit(2);}
for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(k);
const pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})}});
try{
 const {rows}=await pool.query("select current_setting('server_version') as version,to_regnamespace('momentnest') is not null as schema_exists,has_schema_privilege(current_user,'momentnest','usage') as schema_usage,has_table_privilege(current_user,'momentnest.events','delete') as delete_allowed");
 console.log(JSON.stringify({ok:rows[0].schema_exists&&rows[0].schema_usage&&!rows[0].delete_allowed,...rows[0]}));
}catch(error){console.log(JSON.stringify({ok:false,reason:'CONNECTION_OR_PRIVILEGE_CHECK_FAILED',code:typeof error.code==='string'?error.code:'UNKNOWN'}));process.exitCode=1;}finally{await pool.end();}

import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import type { Transaction } from '../src/server/event-store';
export function workerPool(){
 const u=new URL(process.env.WORKER_DATABASE_URL||'');
 if(!decodeURIComponent(u.username).startsWith('momentnest_media_worker')||(!process.env.SUPABASE_PROJECT_REF||!u.toString().includes(process.env.SUPABASE_PROJECT_REF)))throw Error('RESTRICTED_WORKER_REQUIRED');
 for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
 return new Pool({connectionString:u.toString(),max:2,connectionTimeoutMillis:8000,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})}});
}
export function poolTransaction(pool:Pool):Transaction{return async fn=>{const c=await pool.connect();try{await c.query('begin');const r=await fn(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}};}

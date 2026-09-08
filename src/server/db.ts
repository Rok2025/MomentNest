import 'server-only';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import type { Transaction } from './event-store';
let pool: Pool | undefined;
export function database() {
  if(pool) return pool;
  const connectionString=process.env.DATABASE_URL;
  if(!connectionString) throw new Error('DATABASE_NOT_CONFIGURED');
  const url=new URL(connectionString);
  const user=decodeURIComponent(url.username);
  if(user==='postgres'||user.startsWith('postgres.')) throw new Error('ADMIN_DATABASE_ROLE_FORBIDDEN');
  if(!process.env.SUPABASE_PROJECT_REF||!connectionString.includes(process.env.SUPABASE_PROJECT_REF)) throw new Error('WRONG_DATABASE_PROJECT');
  // pg connection URL SSL parameters must not override certificate verification.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  pool=new Pool({connectionString:url.toString(),max:3,idleTimeoutMillis:300000,connectionTimeoutMillis:8000,keepAlive:true,
    ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})}});
  pool.on('error',()=>{console.error('Database pool connection unavailable');});
  return pool;
}
export const transaction: Transaction=async fn=>{
  const client=await database().connect();
  try {await client.query('begin'); const result=await fn(client); await client.query('commit'); return result;}
  catch(error){await client.query('rollback');throw error;}
  finally{client.release();}
};

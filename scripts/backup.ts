import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { loadEnvFile } from 'node:process';
import { exportSnapshot } from '../src/server/backup';
import { finalizeBackup } from '../src/server/readable-backup';
import { storageRoot } from '../src/server/storage/local';
async function backup(){
if(process.env.MOMENTNEST_ENV_FILE)loadEnvFile(process.env.MOMENTNEST_ENV_FILE);
const root=resolve(process.env.BACKUP_ROOT||'.private/backups');await mkdir(root,{recursive:true,mode:0o700});
const dest=join(root,new Date().toISOString().replaceAll(':','-'));const u=new URL(process.env.DATABASE_URL||'');if((!process.env.SUPABASE_PROJECT_REF||!u.toString().includes(process.env.SUPABASE_PROJECT_REF))||decodeURIComponent(u.username).startsWith('postgres'))throw Error('RESTRICTED_CONNECTION_REQUIRED');for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
const pool=new Pool({connectionString:u.toString(),max:1,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})}});
try{
 const c=await pool.connect();let result;
 try{await c.query('begin isolation level repeatable read read only');result=await exportSnapshot(c,dest,storageRoot());await c.query('commit');}
 catch(error){await c.query('rollback');throw error;}
 finally{c.release();}
 const readable=await finalizeBackup(dest);
 console.log(JSON.stringify({ok:true,directory:dest,...result,...readable}));
}finally{await pool.end();}
}
try{await backup();}
catch{console.error('Backup failed; a folder without VERIFIED is incomplete. No live data was changed.');process.exitCode=1;}

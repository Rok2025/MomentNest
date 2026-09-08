import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { exportSnapshot,verifySnapshot } from '../src/server/backup';
import { storageRoot } from '../src/server/storage/local';
const root=resolve(process.env.BACKUP_ROOT||'.private/backups');await mkdir(root,{recursive:true,mode:0o700});
const dest=join(root,new Date().toISOString().replaceAll(':','-'));const u=new URL(process.env.DATABASE_URL||'');if((!process.env.SUPABASE_PROJECT_REF||!u.toString().includes(process.env.SUPABASE_PROJECT_REF))||decodeURIComponent(u.username).startsWith('postgres'))throw Error('RESTRICTED_CONNECTION_REQUIRED');for(const k of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(k);
const pool=new Pool({connectionString:u.toString(),max:1,ssl:{rejectUnauthorized:true,...(process.env.DATABASE_CA_FILE?{ca:readFileSync(process.env.DATABASE_CA_FILE,'utf8')}:{})}});
const c=await pool.connect();
try{await c.query('begin isolation level repeatable read read only');const result=await exportSnapshot(c,dest,storageRoot());await c.query('commit');await verifySnapshot(dest);await writeFile(join(dest,'VERIFIED'),new Date().toISOString(),{mode:0o600});console.log(JSON.stringify({ok:true,directory:dest,...result}));}
catch{await c.query('rollback');console.error('Backup failed; unverified folder is not a valid backup.');process.exitCode=1;}
finally{c.release();await pool.end();}

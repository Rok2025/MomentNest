import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
// Start the built application and both local services together; never stop unrelated processes.
for(const required of ['DATABASE_URL','WORKER_DATABASE_URL','MEDIA_SIGNING_SECRET'])if(!process.env[required])throw Error(required+' is not configured');
await access('.next/BUILD_ID',constants.R_OK);
const appOrigin=new URL(process.env.APP_URL||'http://localhost:3000');
const webPort=Number(appOrigin.port||(appOrigin.protocol==='https:'?443:80));
for(const port of [webPort,Number(process.env.MEDIA_PORT||3001)])await new Promise<void>((resolve,reject)=>{const check=createServer();check.once('error',()=>reject(Error(`Port ${port} is already in use`)));check.listen(port,'127.0.0.1',()=>check.close(()=>resolve()));});
const specs=[['web',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(webPort)]],['storage',['--import','tsx','workers/storage.ts']],['worker',['--import','tsx','workers/media.ts']]] as const;
const children=specs.map(([label,args])=>{const child=spawn(process.execPath,[...args],{stdio:'inherit',env:process.env});child.on('error',()=>console.error(`${label} failed to start`));return child;});
let stopping=false;
function stop(){if(stopping)return;stopping=true;children.forEach(c=>c.kill('SIGTERM'));const timer=setTimeout(()=>children.forEach(c=>{if(c.exitCode===null)c.kill('SIGKILL');}),10000);timer.unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);children.forEach(c=>c.on('exit',code=>{if(!stopping){process.exitCode=code||1;stop();}}));

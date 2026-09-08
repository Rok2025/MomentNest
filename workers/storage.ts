import { storageServer } from '../src/server/storage/http-server';
const server=storageServer();server.requestTimeout=15*60*1000;server.listen(Number(process.env.MEDIA_PORT||3001),process.env.MEDIA_BIND||'127.0.0.1',()=>console.log('Private media server ready'));

import 'server-only';

// Fixed stage names and elapsed time only; never log credentials or account data.
export async function timed<T>(stage:'login.auth'|'login.member'|'home.auth'|'home.data',work:()=>Promise<T>):Promise<T>{
  const start=performance.now();
  try{return await work();}
  finally{console.info(`[timing] ${stage} ${Math.round(performance.now()-start)}ms`);}
}

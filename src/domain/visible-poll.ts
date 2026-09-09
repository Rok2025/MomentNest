// One request at a time; hidden pages pause and visible pages catch up immediately.
export function pollWhileVisible(run:(signal:AbortSignal)=>Promise<void>,delay=6000){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,running=false;
 async function tick(){
  if(controller.signal.aborted||running||document.hidden)return;
  running=true;
  try{await run(controller.signal);}catch{/* Retry temporary failures on the next visible tick. */}
  finally{running=false;if(!controller.signal.aborted&&!document.hidden)timer=setTimeout(()=>void tick(),delay);}
 }
 function visibility(){if(timer)clearTimeout(timer);if(!document.hidden)void tick();}
 document.addEventListener('visibilitychange',visibility);
 if(!document.hidden)timer=setTimeout(()=>void tick(),delay);
 return ()=>{controller.abort();if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
}

// A shared limit for initial selections, later additions and retries.
export class UploadQueue {
 private pending:{key:string;run:()=>Promise<void>;priority:number}[]=[];
 private keys=new Set<string>();
 private active=0;
 constructor(private readonly limit=2){}
 add(key:string,run:()=>Promise<void>,priority=0){
  if(this.keys.has(key))return;
  this.keys.add(key);this.pending.push({key,run,priority});
  this.pending.sort((a,b)=>a.priority-b.priority);
  // Gather a whole selection before choosing the first two files.
  queueMicrotask(()=>this.drain());
 }
 remove(key:string){if(this.pending.some(job=>job.key===key)){this.pending=this.pending.filter(job=>job.key!==key);this.keys.delete(key);}}
 clear(){for(const job of this.pending)this.keys.delete(job.key);this.pending=[];}
 private drain(){
  while(this.active<this.limit&&this.pending.length){
   const job=this.pending.shift()!;this.active++;
   void Promise.resolve().then(job.run).catch(()=>{/* Each upload reports its own error. */}).finally(()=>{
    this.keys.delete(job.key);this.active--;this.drain();
   });
  }
 }
}

// A shared limit for initial selections, later additions and retries.
type QueueOptions={limit?:number;videoLimit?:number};
type Job={key:string;run:()=>Promise<void>;priority:number;kind:'image'|'video'};
export class UploadQueue {
 private pending:Job[]=[];
 private keys=new Set<string>();
 private active=0;
 private activeVideos=0;
 private readonly limit:number;
 private readonly videoLimit:number;
 constructor(options:number|QueueOptions=2){
  this.limit=typeof options==='number'?options:options.limit??2;
  this.videoLimit=typeof options==='number'?this.limit:options.videoLimit??this.limit;
 }
 add(key:string,run:()=>Promise<void>,priority=0,kind:'image'|'video'='image'){
  if(this.keys.has(key))return;
  this.keys.add(key);this.pending.push({key,run,priority,kind});
  this.pending.sort((a,b)=>a.priority-b.priority);
  queueMicrotask(()=>this.drain());
 }
 remove(key:string){if(this.pending.some(job=>job.key===key)){this.pending=this.pending.filter(job=>job.key!==key);this.keys.delete(key);}}
 clear(){for(const job of this.pending)this.keys.delete(job.key);this.pending=[];}
 private drain(){
  while(this.active<this.limit&&this.pending.length){
   const index=this.pending.findIndex(job=>job.kind!=='video'||this.activeVideos<this.videoLimit);
   if(index<0)return;
   const [job]=this.pending.splice(index,1);this.active++;if(job.kind==='video')this.activeVideos++;
   void Promise.resolve().then(job.run).catch(()=>{/* Each upload reports its own error. */}).finally(()=>{
    this.keys.delete(job.key);this.active--;if(job.kind==='video')this.activeVideos--;this.drain();
   });
  }
 }
}

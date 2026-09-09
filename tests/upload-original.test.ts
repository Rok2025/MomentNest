import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {uploadOriginal,type UploadAuth} from '../src/domain/upload-original';
import {UPLOAD_CHUNK_SIZE as chunk} from '../src/domain/upload-progress';
let responses:(number|'network'|'pending')[]=[],sent:{method:string;size:number;range?:string;url:string}[]=[];
class FakeXHR {
 timeout=0;status=0;method='';url='';headers:Record<string,string>={};upload:{onprogress?:(e:{lengthComputable:boolean;loaded:number})=>void}={};
 onload?:()=>void;onerror?:()=>void;ontimeout?:()=>void;onabort?:()=>void;
 open(method:string,url:string){this.method=method;this.url=url;}
 setRequestHeader(key:string,value:string){this.headers[key]=value;}
 send(body:Blob){
  sent.push({method:this.method,size:body.size,range:this.headers['Content-Range'],url:this.url});const result=responses.shift()??201;
  queueMicrotask(()=>{this.upload.onprogress?.({lengthComputable:true,loaded:body.size});if(result==='network')this.onerror?.();else if(result!=='pending'){this.status=result;this.onload?.();}});
 }
 abort(){this.onabort?.();}
}
const auth:UploadAuth={id:'test',url:'https://media.invalid/object',expires:Date.now()+3600000,verified:false};
const file=new File([new Uint8Array(2*chunk+100)],'clip.mov');
const head=(offset:number,complete=false)=>new Response(null,{status:200,headers:{'Upload-Offset':String(offset),'Upload-Complete':complete?'1':'0'}});
beforeEach(()=>{responses=[];sent=[];vi.stubGlobal('XMLHttpRequest',FakeXHR);vi.stubGlobal('fetch',vi.fn().mockResolvedValue(head(0)));});
afterEach(()=>vi.unstubAllGlobals());
describe('browser upload transfer contract',()=>{
 it('resumes from server-confirmed bytes without retransmitting the first chunk',async()=>{
  vi.mocked(fetch).mockResolvedValue(head(chunk));responses=[204,201];const progress=vi.fn();
  await uploadOriginal(file,auth,{signal:new AbortController().signal,progress,refresh:vi.fn()});
  expect(sent.map(s=>[s.size,s.range])).toEqual([[chunk,`bytes ${chunk}-${2*chunk-1}/${file.size}`],[100,`bytes ${2*chunk}-${file.size-1}/${file.size}`]]);
  expect(progress).toHaveBeenLastCalledWith(file.size);
 });
 it('rolls progress back to the confirmed boundary on interruption, then resumes on retry',async()=>{
  responses=[204,'network'];const progress=vi.fn(),options={signal:new AbortController().signal,progress,refresh:vi.fn()};
  await expect(uploadOriginal(file,auth,options)).rejects.toThrow('网络中断');expect(progress).toHaveBeenLastCalledWith(chunk);
  sent=[];vi.mocked(fetch).mockResolvedValue(head(chunk));responses=[204,201];
  await uploadOriginal(file,auth,options);expect(sent[0].range).toContain(`bytes ${chunk}-`);
 });
 it('confirms completed uploads and resumes final assembly without sending the file again',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(head(file.size,true)).mockResolvedValueOnce(head(file.size,false));
  const options={signal:new AbortController().signal,progress:vi.fn(),refresh:vi.fn()};
  await uploadOriginal(file,auth,options);expect(sent).toHaveLength(0);
  await uploadOriginal(file,auth,options);expect(sent).toMatchObject([{method:'POST',size:0}]);
 });
 it('refreshes expired upload tickets and aborts pending transfers on removal',async()=>{
  const controller=new AbortController(),progress=vi.fn(()=>controller.abort()),refresh=vi.fn(async()=>({...auth,url:'https://media.invalid/fresh'}));responses=['pending'];
  await expect(uploadOriginal(file,{...auth,expires:0},{signal:controller.signal,progress:bytes=>{if(bytes>0)progress();},refresh})).rejects.toMatchObject({name:'AbortError'});
  expect(refresh).toHaveBeenCalledOnce();expect(sent[0].url).toBe('https://media.invalid/fresh');
 });
 it('does not treat a busy 409 as a successfully uploaded small file',async()=>{
  responses=[409];const small=new File(['tiny'],'photo.jpg');
  await expect(uploadOriginal(small,auth,{signal:new AbortController().signal,progress:vi.fn(),refresh:vi.fn()})).rejects.toThrow('未完成');
 });
});

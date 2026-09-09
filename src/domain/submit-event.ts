import type {EventInput,SaveResult} from './events';

export async function submitEvent(input:EventInput):Promise<SaveResult>{
 const response=await fetch('/api/events/save',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(60000),
 });
 const result=await response.json();
 if(typeof result?.ok!=='boolean'||(result.ok&&(!response.ok||typeof result.id!=='string'))||(!result.ok&&(typeof result.code!=='string'||typeof result.message!=='string')))throw Error('保存结果尚未确认');
 return result;
}

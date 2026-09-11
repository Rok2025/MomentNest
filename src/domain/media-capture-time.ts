import {z} from 'zod';
import {captureDate,formatCaptureTime} from './capture-date';

const localTime=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, '请输入完整的拍摄日期和时间')
 .transform(value=>value.length===16?`${value}:00`:value)
 .refine(value=>captureDate(value)!==null,'拍摄日期或时间无效');

export const captureTimeInput=z.strictObject({
 capturedTime:localTime,
 expectedOverride:localTime.nullable(),
});

// datetime-local has no timezone. Always show known instants in Beijing time,
// retaining the recorded wall-clock value when the source timezone is unknown.
export function captureTimeInputValue(text:string|null,zone:string|null):string {
 const formatted=formatCaptureTime(text,zone);
 return formatted.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0].replace(' ','T')??'';
}

export function effectiveCaptureTime(row:Record<string,unknown>){
 const override=row.capture_time_override?String(row.capture_time_override):null;
 return {captureTimeOverride:override,capturedText:override??(row.captured_text?String(row.captured_text):null),capturedZone:override?'+08:00':row.captured_zone?String(row.captured_zone):null};
}

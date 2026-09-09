import { z } from 'zod';
import { validEventDate, todayShanghai } from './dates';
export const uuid = z.string().uuid();
export const inputSchema = z.object({
  requestKey: uuid,
  id: uuid.optional(),
  expectedVersion: z.number().int().positive().optional(),
  occurredOn: z.string(),
  title: z.string().trim().max(120, '标题最多120字'),
  body: z.string().trim().max(20000, '正文最多20000字'),
  feeling: z.string().trim().max(5000, '感受最多5000字'),
  uploadIds: z.array(uuid).max(20).default([]),
  uploadDates: z.array(z.object({id:uuid,occurredOn:z.string()}).strict()).max(20).optional(),
  coverMediaId: uuid.nullable().optional(),
}).strict().superRefine((v, ctx) => {
  if (!v.id && !v.body && !v.feeling && !v.uploadIds.length) ctx.addIssue({ code: 'custom', message: '写下这一刻或你的感受后再保存', path: ['body'] });
  if (!!v.id !== !!v.expectedVersion) ctx.addIssue({ code: 'custom', message: '编辑版本无效' });
  if (v.uploadDates && (v.uploadDates.length !== v.uploadIds.length || new Set(v.uploadDates.map(d=>d.id)).size !== v.uploadDates.length || v.uploadDates.some(d=>!v.uploadIds.includes(d.id)))) ctx.addIssue({code:'custom',message:'素材日期与上传文件不一致'});
});
export type EventInput = z.infer<typeof inputSchema>;
export function parseEventInput(raw: unknown, today = todayShanghai()): EventInput {
  const input = inputSchema.parse(raw);
  if (!validEventDate(input.occurredOn, today)) throw new DomainError('VALIDATION', '发生日期须在2025年4月17日至北京时间今天之间');
  if(input.uploadDates?.some(d=>!validEventDate(d.occurredOn,today)))throw new DomainError('VALIDATION','请检查每份素材的日期');
  return input;
}
export type Member = { id: string; householdId: string; label: '爸爸' | '妈妈' };
export type EventRecord = { id: string; title: string; body: string; feeling: string; occurredOn: string; createdAt: string; updatedAt: string; author: string; editor: string; version: number; mediaCount:number; imageCount:number; videoCount:number; coverMediaId:string|null };
export type ErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'CONFLICT' | 'NOT_FOUND' | 'UNAVAILABLE';
export class DomainError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}
export type SaveResult = { ok: true; id: string } | { ok: false; code: ErrorCode; message: string };
export type AuthResult = { ok: boolean; message: string; retryLimited?: boolean };

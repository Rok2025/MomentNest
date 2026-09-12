import { z } from 'zod';
import { captureDate } from './capture-date';
import { validEventDate } from './dates';

// Date-only and timezone-unknown values are intentional; never invent midnight or a zone.
export const confirmedUploadTime = z.object({
  value: z.string().max(80).refine(value => captureDate(value) !== null, '请选择有效的素材时间'),
  replaceExisting: z.boolean().optional(),
}).strict();
export type ConfirmedUploadTime = z.infer<typeof confirmedUploadTime>;

export function mobileUploadAgent(agent: string): boolean {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(agent);
}

export function captureValue(text: string | null, zone: string | null): string | null {
  if (!text || !captureDate(text, zone)) return null;
  const normalized = text.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const offset = zone === 'UTC' ? 'Z' : zone;
  return /T/.test(normalized) && !/(Z|[+-]\d{2}:?\d{2})$/.test(normalized) && offset
    ? normalized + offset : normalized;
}

export function automaticUploadTime(input: {
  capturedText: string | null;
  capturedZone: string | null;
  captureReliable?: boolean;
  yoyotime?: { value?: string | null; valid?: boolean } | null;
}, today: string): ConfirmedUploadTime | null {
  if (input.captureReliable === false) return null;
  // Keep valid yoyotime byte-for-byte: it is the user's already-organized value.
  const value = input.yoyotime?.valid && input.yoyotime.value
    ? input.yoyotime.value
    : captureValue(input.capturedText, input.capturedZone);
  const day = captureDate(value ?? null);
  return value && day && validEventDate(day, today) ? { value } : null;
}

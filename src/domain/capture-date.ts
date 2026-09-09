import { isCalendarDate, todayShanghai, TIME_ZONE } from './dates';

// Camera wall-clock times without a zone stay on their recorded day. Never use mtime.
export function captureDate(text: string | null, zone: string | null = null): string | null {
  if (!text) return null;
  const normalized = text.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const day = normalized.slice(0, 10);
  if (!isCalendarDate(day) || day < '1970-01-01') return null;
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match || (match[1] && (+match[1] > 23 || +match[2] > 59 || +match[3] > 59))) return null;
  const offset = match[4] || (zone === 'UTC' ? 'Z' : zone);
  if (!offset || !match[1]) return day;
  if (!/^(Z|[+-]\d{2}:?\d{2})$/.test(offset)) return day;
  const instant = new Date(match[4] ? normalized : normalized + offset);
  return Number.isNaN(instant.valueOf()) ? null : todayShanghai(instant);
}

export function formatCaptureTime(text: string | null, zone: string | null = null): string {
  if (!text || !captureDate(text, zone)) return '未知';
  const normalized = text.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
  const time = normalized.match(/T(\d{2}:\d{2}:\d{2})/);
  if (!time) return `${normalized.slice(0, 10)}（时间未知）`;
  const embeddedOffset = normalized.match(/(Z|[+-]\d{2}:?\d{2})$/)?.[1];
  const offset = embeddedOffset || (zone === 'UTC' ? 'Z' : zone);
  if (!offset || !/^(Z|[+-]\d{2}:?\d{2})$/.test(offset)) {
    return `${normalized.slice(0, 10)} ${time[1]}（时区未知）`;
  }
  const instant = new Date(embeddedOffset ? normalized : normalized + offset);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}（北京时间）`;
}

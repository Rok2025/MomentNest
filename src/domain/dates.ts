export const BIRTHDAY = '2025-04-17';
export const TIME_ZONE = 'Asia/Shanghai';
export function todayShanghai(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year','month','day'].map(key => parts.find(p => p.type === key)!.value).join('-');
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0,10) === value;
}
export function validEventDate(value: string, today = todayShanghai()): boolean {
  return isCalendarDate(value) && value >= BIRTHDAY && value <= today;
}
function clamped(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
}
export function ageOn(value: string): string {
  if (!isCalendarDate(value) || value < BIRTHDAY) throw new Error('Invalid age date');
  const end = new Date(`${value}T00:00:00Z`);
  let years = end.getUTCFullYear() - 2025;
  let anniversary = clamped(2025 + years, 3, 17);
  if (anniversary > end) anniversary = clamped(2025 + --years, 3, 17);
  let months = 0;
  while (months < 11 && clamped(anniversary.getUTCFullYear(), anniversary.getUTCMonth() + months + 1, anniversary.getUTCDate()) <= end) months++;
  const anchor = clamped(anniversary.getUTCFullYear(), anniversary.getUTCMonth() + months, anniversary.getUTCDate());
  const days = Math.round((end.valueOf() - anchor.valueOf()) / 86400000);
  return `${years}岁${months}个月${days}天`;
}
export function displayTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TIME_ZONE, dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(iso));
}

export function shortAgeOn(value: string): string {
  const full = ageOn(value);
  const [, years, months, days] = full.match(/^(\d+)岁(\d+)个月(\d+)天$/)!;
  if (Number(years)) return `${years}岁${Number(months) ? `${months}个月` : ''}`;
  if (Number(months)) return `${months}个月`;
  return `${days}天`;
}

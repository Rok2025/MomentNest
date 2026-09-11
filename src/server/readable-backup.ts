import { chmod, copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { isCalendarDate } from '../domain/dates';
import { fileHash } from './storage/local';
import { verifySnapshot, type Snapshot } from './backup';

export const readableDirectory = '照片和视频';
type ExportEntry = {
  mediaId: string; eventId: string; householdId: string; uploader: string;
  originalFilename: string; path: string; occurredOn: string;
  capturedText: string | null; captureTimeOverride: string | null; needsTimeReview: boolean;
  kind: string; mime: string; size: number; sha256: string;
};

function filename(value: string): string {
  let name = value.normalize('NFC').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '_').replace(/[. ]+$/g, '');
  if (!name || name === '.' || name === '..') name = '未命名素材';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
  let stem = extension ? name.slice(0, dot) : name;
  // Leave room for a collision suffix and common filesystem filename limits.
  while (Buffer.byteLength(stem + extension) > 180 && stem.length) stem = [...stem].slice(0, -1).join('');
  return stem + extension;
}

function uniqueName(original: string, id: string, used: Set<string>): string {
  const name = filename(original), dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : '';
  let result = name, attempt = 0;
  while (used.has(result.toLowerCase())) {
    result = `${stem}__${id.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'copy'}${attempt ? `_${attempt}` : ''}${extension}`;
    attempt++;
  }
  used.add(result.toLowerCase());
  return result;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Names are user input. Opening the manifest in a spreadsheet must not run formulas.
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportReadableMedia(snapshot: Snapshot, folder: string) {
  const destination = join(folder, readableDirectory);
  await mkdir(destination, { recursive: false, mode: 0o700 });
  const events = new Map(snapshot.tables.events.map(e => [String(e.id), e]));
  const members = new Map(snapshot.tables.members.map(m => [String(m.id), m]));
  const uploads = new Map(snapshot.tables.upload_sessions.map(u => [String(u.id), u]));
  const files = new Map(snapshot.files.map(f => [f.key, f]));
  const names = new Map<string, Set<string>>(), entries: ExportEntry[] = [];
  const seen = new Set<string>();
  // Stable order also makes collision suffixes stable between backups.
  for (const media of [...snapshot.tables.media].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const event = events.get(String(media.event_id)), file = files.get(String(media.object_key));
    if (!event || !file || event.household_id !== media.household_id || file.sha256 !== media.sha256 || file.size !== Number(media.size) || seen.has(file.key)) throw Error('INVALID_EXPORT_RELATION');
    seen.add(file.key);
    const date = String(event.occurred_on ?? ''), day = isCalendarDate(date) ? date : '日期待确认';
    if (!names.has(day)) { names.set(day, new Set()); await mkdir(join(destination, day), { mode: 0o700 }); }
    const name = uniqueName(String(media.filename), String(media.id), names.get(day)!);
    const relative = `${day}/${name}`, target = join(destination, day, name);
    // Independent copies: editing the browsable copy must not damage the restore copy.
    await copyFile(join(folder, 'originals', file.key), target, constants.COPYFILE_EXCL);
    await chmod(target, 0o600);
    if (await fileHash(target) !== file.sha256 || (await stat(target)).size !== file.size) throw Error('READABLE_COPY_HASH_MISMATCH');
    const upload = uploads.get(String(media.upload_session_id));
    const member = members.get(String(upload?.member_id ?? event.created_by));
    entries.push({ mediaId: String(media.id), eventId: String(event.id), householdId: String(media.household_id),
      uploader: member && member.household_id === media.household_id ? String(member.label) : '未知成员',
      originalFilename: String(media.filename), path: relative, occurredOn: date,
      capturedText: media.captured_text ? String(media.captured_text) : null,
      captureTimeOverride: media.capture_time_override ? String(media.capture_time_override) : null,
      needsTimeReview: media.needs_time_review === true || !isCalendarDate(date),
      kind: String(media.kind), mime: String(media.mime), size: file.size, sha256: file.sha256 });
  }
  if (seen.size !== snapshot.files.length) throw Error('EXPORT_COUNT_MISMATCH');
  const header = ['归档日期', '上传者', '原始文件名', '导出路径', '类型', '待修改时间', '拍摄时间原值', '修改后的拍摄时间（北京时间）', '素材ID', '回忆ID', '家庭ID', '字节数', 'SHA256'];
  const rows = entries.map(e => [e.occurredOn, e.uploader, e.originalFilename, e.path, e.kind, e.needsTimeReview ? '是' : '否', e.capturedText, e.captureTimeOverride, e.mediaId, e.eventId, e.householdId, e.size, e.sha256]);
  await writeFile(join(destination, '导出清单.csv'), '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n', { flag: 'wx', mode: 0o600 });
  await writeFile(join(destination, 'manifest.json'), JSON.stringify({ version: 1, dateBasis: 'event.occurred_on', entries }, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(join(destination, '说明.txt'), '照片和视频为原始内容的独立副本，没有压缩或转码。\n文件夹使用回忆的归档日期，不代表已确认的拍摄日期。待修改时间的素材见导出清单。\n保留原始文件名；不兼容的文件名字符会替换，同名文件追加编号以防覆盖。准确原名保留在清单中。\n包含此项目所有成员已保存的素材，不含未保存的临时上传。文字回忆和其他业务信息保存在上一级 snapshot.json。\nHEIC、MOV 等格式需要支持该格式的查看软件。\n系统恢复请保留上一级 snapshot.json、snapshot.sha256 和 originals 目录。登录密码、会话及服务器配置不在此备份内。\n', { flag: 'wx', mode: 0o600 });
  return { readableDirectory: destination, exportedFiles: entries.length, reviewFiles: entries.filter(e => e.needsTimeReview).length };
}

// Call only after the read-only snapshot transaction has committed. No live DB reads
// are performed here: both copies describe the same point-in-time snapshot.
export async function finalizeBackup(folder: string) {
  const snapshot = await verifySnapshot(folder);
  const result = await exportReadableMedia(snapshot, folder);
  await writeFile(join(folder, 'VERIFIED'), JSON.stringify({ verifiedAt: new Date().toISOString(), systemOriginals: snapshot.files.length, readableOriginals: result.exportedFiles }), { flag: 'wx', mode: 0o600 });
  return result;
}

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, access, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { backupTables, exportSnapshot, verifySnapshot } from '../src/server/backup';
import { finalizeBackup, readableDirectory } from '../src/server/readable-backup';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture(names = ['IMG_0001.JPG', 'img_0001.jpg', '家庭视频.MOV']) {
  const root = await mkdtemp(join(tmpdir(), 'momentnest-readable-')); roots.push(root);
  const tables: Record<string, Record<string, unknown>[]> = Object.fromEntries(backupTables.map(t => [t, []]));
  tables.households = [{ id: uuid(1) }, { id: uuid(2) }];
  tables.members = names.map((_, i) => ({ id: uuid(10 + i), household_id: uuid(i < 2 ? 1 : 2), label: i === 1 ? '妈妈' : '爸爸' }));
  tables.events = names.map((_, i) => ({ id: uuid(20 + i), household_id: uuid(i < 2 ? 1 : 2), occurred_on: i < 2 ? '2026-08-07' : '2026-09-10', created_by: uuid(10 + i) }));
  tables.events.push({ id: uuid(99), household_id: uuid(1), occurred_on: '2026-08-01', body: '只有文字的回忆' });
  for (const [i, name] of names.entries()) {
    const key = `originals/${uuid(i < 2 ? 1 : 2)}/${uuid(30 + i)}.bin`, bytes = Buffer.from(`original-content-${i}`);
    const target = join(root, 'source', key); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
    tables.upload_sessions.push({ id: uuid(40 + i), member_id: uuid(10 + i) });
    tables.media.push({ id: uuid(30 + i), household_id: uuid(i < 2 ? 1 : 2), event_id: uuid(20 + i), upload_session_id: uuid(40 + i), object_key: key,
      filename: name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), kind: i === 2 ? 'video' : 'image', mime: i === 2 ? 'video/quicktime' : 'image/jpeg', needs_time_review: i === 2, captured_text: null });
  }
  const folder = join(root, 'backup');
  await exportSnapshot({ query: async sql => ({ rows: tables[sql.match(/from momentnest\.(\w+)/)![1]] }) }, folder, join(root, 'source'));
  return { root, folder, tables };
}
async function manifest(folder: string) {
  return JSON.parse(await readFile(join(folder, readableDirectory, 'manifest.json'), 'utf8')) as { entries: { path: string; originalFilename: string; uploader: string; householdId: string; needsTimeReview: boolean }[] };
}

describe('system and browsable backup copies', () => {
  it('包含所有成员和家庭的已保存素材，按归档日期导出、区分同名并保留待核对标记', async () => {
    const { folder, tables } = await fixture();
    expect(await finalizeBackup(folder)).toMatchObject({ exportedFiles: 3, reviewFiles: 1 });
    const { entries } = await manifest(folder);
    expect(entries.map(e => e.uploader)).toEqual(['爸爸', '妈妈', '爸爸']);
    expect(new Set(entries.map(e => e.householdId)).size).toBe(2);
    expect(entries[0].path).toBe('2026-08-07/IMG_0001.JPG');
    expect(entries[1].path).toMatch(/^2026-08-07\/img_0001__.+\.jpg$/);
    expect(entries[2]).toMatchObject({ path: '2026-09-10/家庭视频.MOV', needsTimeReview: true });
    for (const [i, entry] of entries.entries()) expect(await readFile(join(folder, readableDirectory, entry.path), 'utf8')).toBe(`original-content-${i}`);
    expect((await verifySnapshot(folder)).tables.events).toHaveLength(4);
    const csv = await readFile(join(folder, readableDirectory, '导出清单.csv'), 'utf8');
    expect(csv).toContain('妈妈'); expect(csv).toContain('"是"');
    expect(JSON.parse(await readFile(join(folder, 'VERIFIED'), 'utf8'))).toMatchObject({ systemOriginals: 3, readableOriginals: 3 });
    // Editing a browsable copy must not alter the system restore original.
    await writeFile(join(folder, readableDirectory, entries[0].path), 'edited');
    expect(await readFile(join(folder, 'originals', String(tables.media[0].object_key)), 'utf8')).toBe('original-content-0');
    await expect(verifySnapshot(folder)).resolves.toBeDefined();
  });

  it('路径字符和保留名可安全导出，CSV 中的公式文件名只作为文字', async () => {
    const { folder } = await fixture(['../../照片.jpg', 'CON.jpg', '=SUM(1,2).MOV']);
    await finalizeBackup(folder);
    const { entries } = await manifest(folder);
    expect(entries[0].path).toBe('2026-08-07/.._.._照片.jpg');
    expect(entries[1].path).toBe('2026-08-07/_CON.jpg');
    expect(entries[0].originalFilename).toBe('../../照片.jpg');
    expect(await readFile(join(folder, readableDirectory, '导出清单.csv'), 'utf8')).toContain('"\'=SUM(1,2).MOV"');
  });

  it('内容损坏或导出目录已存在时失败，不生成成功标记也不覆盖文件', async () => {
    const damaged = await fixture(['photo.jpg']);
    await writeFile(join(damaged.folder, 'originals', String(damaged.tables.media[0].object_key)), 'corrupt');
    await expect(finalizeBackup(damaged.folder)).rejects.toThrow('ORIGINAL_HASH_MISMATCH');
    await expect(access(join(damaged.folder, 'VERIFIED'))).rejects.toThrow();
    const existing = await fixture(['photo.jpg']);
    await mkdir(join(existing.folder, readableDirectory));
    await writeFile(join(existing.folder, readableDirectory, 'keep.txt'), 'keep');
    await expect(finalizeBackup(existing.folder)).rejects.toThrow();
    expect(await readFile(join(existing.folder, readableDirectory, 'keep.txt'), 'utf8')).toBe('keep');
    await expect(access(join(existing.folder, 'VERIFIED'))).rejects.toThrow();
  });

  it('没有照片视频时仍备份文字回忆，并生成空导出清单', async () => {
    const { folder } = await fixture([]);
    expect(await finalizeBackup(folder)).toMatchObject({ exportedFiles: 0, reviewFiles: 0 });
    expect((await manifest(folder)).entries).toEqual([]);
    expect(await readdir(join(folder, readableDirectory))).toHaveLength(3);
    expect((await verifySnapshot(folder)).tables.events).toHaveLength(1);
  });

  it('家庭备份只包含发起者所在家庭，管理员不会看到其他家庭的内容', async () => {
    const { root, tables } = await fixture();
    const scoped = join(root, 'scoped-backup');
    await exportSnapshot({ query: async sql => ({ rows: tables[sql.match(/from momentnest\.(\w+)/)![1]].filter(row => sql.includes('where') ? String(row.household_id ?? row.id) === uuid(1) : true) }) }, scoped, join(root, 'source'), uuid(1));
    const snapshot = await verifySnapshot(scoped);
    expect(snapshot.tables.households).toHaveLength(1);
    expect(snapshot.tables.events).toHaveLength(3);
    expect(snapshot.tables.media).toHaveLength(2);
  });
});

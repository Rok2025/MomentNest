import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { access, mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { saveEvent, getEvent, type Transaction } from '../src/server/event-store';
import { authorizeDraft, savedDuplicate } from '../src/server/upload-drafts';
import { completeUpload, listMedia } from '../src/server/media-store';
import { originalEvidence, objectPath, fileHash } from '../src/server/storage/local';
import { readCapture } from '../src/server/storage/capture';
import { processMedia } from '../workers/process-media';
import { claimJob, finishJob } from '../src/server/job-store';
import { uploadDateReady } from '../src/domain/upload-date';
import { confirmedUploadTime } from '../src/domain/upload-time';

let db: PGlite, root: string;
let fixtureIndex = 0;
const previous = process.env.MEDIA_ROOT, h = randomUUID(), auth = randomUUID();
const tx: Transaction = fn => db.transaction(t => fn(t));
beforeAll(async () => {
 root = await mkdtemp(join(tmpdir(), 'momentnest-mobile-')); process.env.MEDIA_ROOT = root;
 db = new PGlite();
 await db.exec('create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);');
 for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await db.exec(await readFile(join('supabase/migrations', file), 'utf8'));
 await db.query('insert into auth.users values($1)', [auth]);
 await db.query('insert into momentnest.households(id,name) values($1,$2)', [h, '测试家庭']);
 await db.query('insert into momentnest.subjects(household_id) values($1)', [h]);
 await db.query("insert into momentnest.members(household_id,auth_user_id,label) values($1,$2,'爸爸')", [h, auth]);
});
afterAll(async () => { await db?.close(); if (previous === undefined) delete process.env.MEDIA_ROOT; else process.env.MEDIA_ROOT = previous; await rm(root, { recursive: true, force: true }); });
async function fixture() {
 const bytes = await sharp({ create: { width: 24 + fixtureIndex++, height: 24, channels: 3, background: { r: 80, g: 100, b: 20 } } })
  .withExif({ IFD2: { DateTimeOriginal: '2026:01:01 09:10:11', OffsetTimeOriginal: '+08:00' } }).jpeg().toBuffer();
 const { createHash } = await import('node:crypto');
 const sha256 = createHash('sha256').update(bytes).digest('hex');
 const result = await authorizeDraft(tx, auth, { name: 'mobile.jpg', size: bytes.length, sha256, requestKey: randomUUID(), batchId: randomUUID() });
 const u = result.upload!;
 await mkdir(dirname(objectPath(String(u.object_key))), { recursive: true });
 await writeFile(objectPath(String(u.object_key)), bytes);
 await completeUpload(tx, auth, String(u.id), await originalEvidence(String(u.object_key)));
 const input = { requestKey: randomUUID(), title: '', body: '', feeling: '', occurredOn: '2025-06-02', uploadIds: [String(u.id)], confirmUploadTimes: true,
  uploadDates: [{ id: String(u.id), occurredOn: '2025-06-02', confirmedTime: { value: '2025-06-01T23:30:12.123-04:00' } }] };
 return { u, input, sha256 };
}
it('requires explicit mobile confirmation, preserves date-only precision and rejects invalid values', () => {
 expect(uploadDateReady({ requiresTimeConfirmation: true, capturedOn: '2025-06-02', occurredOn: '2025-06-02' }, '2026-09-12')).toBe(false);
 expect(uploadDateReady({ requiresTimeConfirmation: true, occurredOn: '2025-06-02', confirmedTime: { value: '2025-06-02' } }, '2026-09-12')).toBe(true);
 for (const value of ['2025-02-30', '2025-06-02T25:00:00', '2025-06-02T12:00:00+99:00']) expect(confirmedUploadTime.safeParse({ value }).success).toBe(false);
});
it('saves real file XMP before media binding; DB time/date/hash, worker and duplicate detection agree', async () => {
 const { u, input, sha256 } = await fixture();
 await db.exec('set role momentnest_app');
 let event: string;
 try { event = await saveEvent(tx, auth, input); } finally { await db.exec('reset role'); }
 expect(await saveEvent(tx, auth, input)).toBe(event);
 expect((await getEvent(db, auth, event)).occurredOn).toBe('2025-06-02');
 const media = (await db.query<Record<string, unknown>>('select * from momentnest.media where event_id=$1', [event])).rows[0];
 expect(media.object_key).not.toBe(u.object_key);
 expect(await fileHash(objectPath(String(u.object_key)))).toBe(sha256);
 expect(await originalEvidence(String(media.object_key))).toMatchObject({ sha256: media.sha256, size: Number(media.size) });
 expect(media.sha256).not.toBe(sha256);
 expect((await listMedia(db, auth, event))[0]).toMatchObject({ capturedText: input.uploadDates[0].confirmedTime.value, capturedZone: '-04:00' });
 expect(await readCapture(objectPath(String(media.object_key)), 'image')).toMatchObject({ capturedOn: '2025-06-02', capturedText: input.uploadDates[0].confirmedTime.value });
 const job = await claimJob(tx);
 expect(job?.key).toBe(media.object_key);
 const processed = await processMedia(job!);
 await finishJob(tx, job!, processed);
 expect((await listMedia(db, auth, event))[0]).toMatchObject({ status: 'ready', capturedText: input.uploadDates[0].confirmedTime.value });
 expect(await savedDuplicate(db, h, sha256, Number(u.expected_size))).toMatchObject({ eventId: event });
 expect(await savedDuplicate(db, h, String(media.sha256), Number(media.size))).toMatchObject({ eventId: event });
 const count = await db.query<{ n: number }>('select count(*)::int as n from momentnest.media where upload_session_id=$1', [u.id]);
 expect(count.rows[0].n).toBe(1);
});
it('rejects missing/mismatching confirmation; transaction rollback keeps source verifiable and allows a changed-time retry', async () => {
 const { u, input, sha256 } = await fixture();
 await expect(saveEvent(tx, auth, { ...input, uploadDates: [{ id: u.id, occurredOn: '2025-06-02' }] })).rejects.toThrow('请逐份确认');
 await expect(saveEvent(tx, auth, { ...input, uploadDates: [{ ...input.uploadDates[0], occurredOn: '2025-06-01' }] })).rejects.toMatchObject({ code: 'VALIDATION' });
 const rollback: Transaction = fn => db.transaction(async t => { await fn(t); throw Error('rollback after binding'); });
 await expect(saveEvent(rollback, auth, input)).rejects.toThrow('rollback after binding');
 expect((await db.query<{ state: string }>('select state from momentnest.upload_sessions where id=$1', [u.id])).rows[0].state).toBe('verified');
 await completeUpload(tx, auth, String(u.id), await originalEvidence(String(u.object_key)));
 expect(await fileHash(objectPath(String(u.object_key)))).toBe(sha256);
 const next = { ...input, uploadDates: [{ ...input.uploadDates[0], confirmedTime: { value: '2025-06-02T10:15' } }] };
 const id = await saveEvent(tx, auth, next);
 expect((await listMedia(db, auth, id))[0]).toMatchObject({ capturedText: '2025-06-02T10:15', capturedZone: null });
});
it('a write-tool failure cannot save an event or enqueue media, and retries after recovery', async () => {
 const { u, input } = await fixture();
 const perl = process.env.PERL_PATH; process.env.PERL_PATH = '/missing-perl-for-isolated-test';
 try { await expect(saveEvent(tx, auth, input)).rejects.toMatchObject({ code: 'VALIDATION' }); }
 finally { if (perl === undefined) delete process.env.PERL_PATH; else process.env.PERL_PATH = perl; }
 expect((await db.query('select id from momentnest.media where upload_session_id=$1', [u.id])).rows).toHaveLength(0);
 expect((await db.query('select request_key from momentnest.save_requests where request_key=$1', [input.requestKey])).rows).toHaveLength(0);
 expect(await saveEvent(tx, auth, input)).toBeTruthy();
});
it('waits for an already-started copy, stops the remaining batch, and rolls back every binding', async () => {
 const first = await fixture(), second = await fixture(), third = await fixture();
 const value = '2025-06-01T10:15:00+08:00';
 const input = {
  requestKey: randomUUID(), title: '', body: '', feeling: '', occurredOn: '2025-06-01', confirmUploadTimes: true,
  uploadIds: [String(first.u.id), String(second.u.id), String(third.u.id)],
  uploadDates: [
   // This fails before any filesystem work. The second item is already active;
   // the third must not be claimed after the bounded queue sees the failure.
   { id: String(first.u.id), occurredOn: '2025-06-02', confirmedTime: { value } },
   { id: String(second.u.id), occurredOn: '2025-06-01', confirmedTime: { value } },
   { id: String(third.u.id), occurredOn: '2025-06-01', confirmedTime: { value } },
  ],
 };
 await expect(saveEvent(tx, auth, input)).rejects.toMatchObject({ code: 'VALIDATION' });
 const states = await db.query<{ id: string; state: string }>('select id,state from momentnest.upload_sessions where id=any($1::uuid[])', [input.uploadIds]);
 expect(states.rows.every(row => row.state === 'verified')).toBe(true);
 expect((await db.query('select id from momentnest.media where upload_session_id=any($1::uuid[])', [input.uploadIds])).rows).toHaveLength(0);
 expect((await db.query('select request_key from momentnest.save_requests where request_key=$1', [input.requestKey])).rows).toHaveLength(0);
 await expect(access(objectPath(String(second.u.object_key).replace(/\.bin$/, '-c.bin')))).resolves.toBeUndefined();
 await expect(access(objectPath(String(third.u.object_key).replace(/\.bin$/, '-c.bin')))).rejects.toThrow();
});

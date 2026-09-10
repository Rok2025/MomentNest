import { readFile, access, writeFile, unlink, statfs } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
let stage = 'configuration';
try {
  const e = process.env;
  if (e.APP_URL !== 'https://nest.rokzhang.cn' || e.MEDIA_PUBLIC_URL !== e.APP_URL + '/media') throw Error();
  if (!e.SUPABASE_PROJECT_REF || new URL(e.SUPABASE_URL).hostname !== e.SUPABASE_PROJECT_REF + '.supabase.co' || !e.SUPABASE_PUBLISHABLE_KEY) throw Error();
  if (!e.MEDIA_SIGNING_SECRET || e.MEDIA_SIGNING_SECRET.length < 40 || e.MEDIA_BIND !== '127.0.0.1' || e.MEDIA_PORT !== '3211' || e.MOMENTNEST_PREVIEW === '1') throw Error();
  stage = 'private disk';
  for (const dir of [e.MEDIA_ROOT, e.BACKUP_ROOT]) {
    if (!dir || !isAbsolute(dir)) throw Error();
    await access(dir);
    const disk = await statfs(dir);
    if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw Error();
    const probe = join(dir, '.deploy-check-' + randomUUID());
    await writeFile(probe, '', { flag: 'wx', mode: 0o600 });
    await unlink(probe);
  }
  stage = 'media tools';
  for (const tool of [e.FFMPEG_PATH, e.FFPROBE_PATH, e.HEIF_CONVERT_PATH]) {
    if (!tool || !isAbsolute(tool)) throw Error();
    await access(tool);
  }
  execFileSync(e.FFMPEG_PATH, ['-version'], { stdio: 'ignore', timeout: 10000 });
  const ca = await readFile(e.DATABASE_CA_FILE, 'utf8');
  for (const [name, worker] of [['DATABASE_URL', false], ['WORKER_DATABASE_URL', true]]) {
    stage = worker ? 'worker database' : 'application database';
    const u = new URL(e[name]);
    const user = decodeURIComponent(u.username);
    if (!u.toString().includes(e.SUPABASE_PROJECT_REF) || user === 'postgres' || user.startsWith('postgres.') || (worker && !user.startsWith('momentnest_media_worker'))) throw Error();
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) u.searchParams.delete(key);
    const pool = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: true, ca }, connectionTimeoutMillis: 8000, query_timeout: 8000, max: 1 });
    try {
      await pool.query('select media_id from momentnest.media_jobs limit 0');
      await pool.query('select needs_time_review from momentnest.media limit 0');
      const { rows } = await pool.query("select has_table_privilege(current_user,'momentnest.events','delete') as can_delete");
      if (rows[0].can_delete) throw Error();
      if (!worker) {
        stage = 'media count migration (unlimited total required)';
        const limit = await pool.query("select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='momentnest.events'::regclass and conname='events_media_count_check' and convalidated");
        if ((limit.rows[0]?.definition || '').replace(/[\s()]/g, '') !== 'CHECKmedia_count>=0') throw Error();
      }
    } finally { await pool.end(); }
  }
  stage = 'Auth connection and signup policy';
  const auth = await fetch(e.SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: e.SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(15000) });
  if (!auth.ok || (await auth.json()).disable_signup !== true) throw Error();
  console.log('Preflight passed: config, restricted DB roles, private disk, media tools and Auth.');
} catch {
  console.error(`Production preflight failed at ${stage}; credentials and connection details withheld.`);
  process.exitCode = 1;
}

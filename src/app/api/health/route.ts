import { readFile } from 'node:fs/promises';
import { database } from '@/server/db';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const check = { text: 'select 1', query_timeout: 8000 };
    await database().query(check);
    const commit = (await readFile('COMMIT', 'utf8')).trim();
    if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('VERSION_UNAVAILABLE');
    return Response.json({ ok: true, commit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}

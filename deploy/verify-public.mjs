import { readFile } from 'node:fs/promises';

const [commit, origin] = process.argv.slice(2);
try {
  const health = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(20000) });
  const result = await health.json();
  if (!health.ok || !result.ok || result.commit !== commit) throw Error();
  const login = await fetch(origin + '/login', { signal: AbortSignal.timeout(20000) });
  if (!login.ok || !(await login.text()).includes('登录')) throw Error();
  const privatePage = await fetch(origin + '/', { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  if (![302, 303, 307, 308].includes(privatePage.status) || !new URL(privatePage.headers.get('location'), origin).pathname.startsWith('/login')) throw Error();
  const media = await fetch(origin + '/media/object', { signal: AbortSignal.timeout(10000) });
  if (media.status !== 400) throw Error();
  const picker = await fetch(origin + '/photo-picker-check.html', { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const expectedPicker = await readFile(new URL('../public/photo-picker-check.html', import.meta.url), 'utf8');
  if (picker.status !== 200 || !picker.headers.get('content-type')?.includes('text/html') || await picker.text() !== expectedPicker) throw Error('Photo picker comparison page is missing or differs from this release.');
  console.log('HTTPS verified: version, login, private page redirect, unsigned media rejection and photo picker comparison page.');
} catch {
  console.error('Public verification failed.');
  process.exitCode = 1;
}

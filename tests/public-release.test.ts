import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const commit = 'a'.repeat(40);
const script = fileURLToPath(new URL('../deploy/verify-public.mjs', import.meta.url));

async function verify(pickerStatus: number, pickerBody?: string, type = 'text/html') {
  const expected = await readFile(new URL('../public/photo-picker-check.html', import.meta.url), 'utf8');
  const server = createServer((req, res) => {
    switch (req.url) {
      case '/api/health': res.setHeader('Content-Type', 'application/json');res.end(JSON.stringify({ ok: true, commit }));break;
      case '/login': res.end('登录');break;
      case '/': res.writeHead(307, { Location: '/login' });res.end();break;
      case '/media/object': res.writeHead(400);res.end();break;
      case '/photo-picker-check.html':
        res.writeHead(pickerStatus, { 'Content-Type': type, ...(pickerStatus === 302 ? { Location: '/login' } : {}) });
        res.end(pickerBody ?? expected);break;
      default: res.writeHead(404);res.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(process.execPath, [script, commit, `http://127.0.0.1:${(server.address() as AddressInfo).port}`], { timeout: 10000 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

describe('public release verification', () => {
  it('accepts the exact static page from the release', async () => {
    await expect(verify(200)).resolves.toMatchObject({ stderr: '' });
  });
  it.each([
    [404, 'Not found', 'text/html'],
    [200, '登录', 'text/html'],
    [200, undefined, 'text/plain'],
    [302, '', 'text/html'],
  ])('rejects missing, substituted, incorrectly served or redirected pages (%s, %s, %s)', async (status, body, type) => {
    await expect(verify(status, body, type)).rejects.toMatchObject({ code: 1 });
  });
});

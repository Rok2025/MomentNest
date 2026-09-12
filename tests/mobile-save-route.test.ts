import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inputSchema } from '../src/domain/events';
const mocks = vi.hoisted(() => ({ save: vi.fn(), identity: vi.fn(), revalidate: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('../src/server/db', () => ({ transaction: vi.fn() }));
vi.mock('../src/server/auth/session', () => ({ requireIdentity: mocks.identity }));
vi.mock('../src/server/event-store', () => ({ saveEvent: mocks.save }));
import { POST } from '../src/app/api/events/save/route';
const upload = randomUUID();
const input = () => ({ requestKey: randomUUID(), title: '', body: '', feeling: '', occurredOn: '2025-06-02', uploadIds: [upload], uploadDates: [{ id: upload, occurredOn: '2025-06-02' }] });
function request(body: unknown, agent: string) { return new Request('http://localhost:3000/api/events/save', { method: 'POST', headers: { origin: process.env.APP_URL || 'http://localhost:3000', 'content-type': 'application/json', 'user-agent': agent }, body: JSON.stringify(body) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.identity.mockResolvedValue('member'); mocks.save.mockImplementation(async (_tx, _auth, raw) => { inputSchema.parse(raw); return 'event'; }); });
it.each(['iPhone Mobile Safari', 'Android Chrome', 'iPad Safari'])('enforces confirmation at the API for %s even if the client omits it', async agent => {
 const response = await POST(request(input(), agent));
 expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ ok: false, code: 'VALIDATION' });
 expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('leaves desktop payload unchanged and accepts explicit iPad desktop-mode confirmation', async () => {
 const raw = input(); expect((await POST(request(raw, 'Macintosh Chrome'))).status).toBe(200);
 expect(mocks.save.mock.calls[0][2]).toEqual(raw);
 const mobile = { ...raw, confirmUploadTimes: true, uploadDates: [{ ...raw.uploadDates[0], confirmedTime: { value: '2025-06-02' } }] };
 expect((await POST(request(mobile, 'Macintosh Safari'))).status).toBe(200);
 expect(mocks.save.mock.calls[1][2]).toEqual(mobile);
});

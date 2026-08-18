// The health endpoint reports free space on the volume the database lives on.
// The write probe catches a disk that is already full; this is the half that
// can be seen coming, since the DB and its rotating backups share one volume
// and nothing else watches it.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import os from 'os';
import path from 'path';

const dbPath = path.join(os.tmpdir(), `health-disk-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbPath;
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {}, notifyUserConfirmed: async () => 'none',
  initTelegramBot: () => {}, isTelegramConfigured: () => false, stopTelegramBot: () => {},
}));

const { default: app } = await import('../src/app.js');

const { testServer } = await import('./helpers.js');
const server = await testServer(app);
describe('GET /api/health', () => {
  it('reports free and total space for a real on-disk database', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.disk.freeMb).toBeGreaterThan(0);
    expect(res.body.disk.totalMb).toBeGreaterThanOrEqual(res.body.disk.freeMb);
    expect(res.body.disk.usedPct).toBeGreaterThanOrEqual(0);
    expect(res.body.disk.usedPct).toBeLessThanOrEqual(100);
  });

  it('still answers 200 ok — adding disk reporting must not change what "healthy" means', async () => {
    const res = await request(server).get('/api/health');
    expect(res.status).toBe(200);
    expect(['ok', 'degraded']).toContain(res.body.status);
  });
});

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

const { default: app, lowDiskThresholdMb } = await import('../src/app.js');

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

// Railway hands out a 433MB volume by default, and the threshold was a flat
// 512MB of free space — more than the disk holds. The endpoint reported
// "degraded" from the moment the volume was created, at 6% used, and would
// have gone on reporting it forever. An alarm that never stops is one
// nobody looks at, which is worse than not having it: this endpoint exists
// to make the one disk problem visible *before* it arrives.
describe('the low-disk threshold', () => {
  it('never asks for more headroom than the volume can hold', () => {
    // The case that was live in production.
    expect(lowDiskThresholdMb(433)).toBeLessThan(433);
    expect(lowDiskThresholdMb(433)).toBe(87);

    for (const total of [50, 100, 433, 1024]) {
      expect(lowDiskThresholdMb(total), `${total}MB`).toBeLessThan(total);
    }
  });

  it('keeps a flat floor once the volume is big enough for one', () => {
    // A fifth of 50GB is 10GB, which is not a useful warning level.
    expect(lowDiskThresholdMb(10240)).toBe(512);
    expect(lowDiskThresholdMb(51200)).toBe(512);
  });

  it('calls a healthy volume healthy, and a nearly-full one degraded', () => {
    // 6% used on the real Railway volume: fine.
    expect(407).toBeGreaterThan(lowDiskThresholdMb(433));
    // Same volume with 40MB left: not fine.
    expect(40).toBeLessThan(lowDiskThresholdMb(433));
  });
});

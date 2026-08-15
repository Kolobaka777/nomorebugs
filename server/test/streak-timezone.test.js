// Regression coverage for the 2026-08-15 audit finding: the streak
// calculation in profile.js bucketed activity_log rows by UTC calendar day
// (SQLite's DATE()) and compared against `new Date().toISOString()`'s UTC
// "today" — both UTC-consistent with each other, but wrong relative to the
// user's own local calendar day (user_profiles.timezone, same field
// presence.js's todayInTimezone already uses elsewhere). Moscow (UTC+3)
// rolls its calendar day over 3 hours before UTC does, so any activity in
// that 3-hour window got bucketed into the *previous* UTC day — a real
// tester active at, say, 00:30 local time and checking their streak later
// the same local day would see it silently reset to 0, even though they
// were genuinely active earlier that (local) day.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('streak — local timezone vs UTC calendar day', () => {
  it('counts activity from just after local midnight as "today" even though it fell on the previous UTC calendar day', async () => {
    // Default timezone (user_profiles.timezone unset) is Europe/Moscow
    // (UTC+3) — see presence.js/profile.js's fallback.
    db.exec('DELETE FROM activity_log');
    // 2026-08-14 21:30:00 UTC = 2026-08-15 00:30:00 Moscow — the tester's
    // *local* "today" (Aug 15), even though the raw UTC timestamp is
    // still Aug 14.
    db.prepare(
      "INSERT INTO activity_log (user_id, action, created_at) VALUES (?, 'login', '2026-08-14 21:30:00')"
    ).run(fixtures.testerId);

    // "Now" is 2026-08-15 07:00:00 UTC = 2026-08-15 10:00:00 Moscow —
    // still the same Moscow calendar day as the activity above, but
    // already the *next* UTC calendar day.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T07:00:00Z'));

    const res = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.streak).toBe(1);
  });

  it('two consecutive local calendar days of late-night activity give a streak of 2', async () => {
    db.exec('DELETE FROM activity_log');
    db.prepare(
      "INSERT INTO activity_log (user_id, action, created_at) VALUES (?, 'login', '2026-08-13 21:00:00')"
    ).run(fixtures.testerId); // 2026-08-14 00:00 Moscow
    db.prepare(
      "INSERT INTO activity_log (user_id, action, created_at) VALUES (?, 'login', '2026-08-14 21:30:00')"
    ).run(fixtures.testerId); // 2026-08-15 00:30 Moscow

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T07:00:00Z')); // 2026-08-15 10:00 Moscow

    const res = await request(app).get('/api/tester/profile-full').set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.streak).toBe(2);
  });
});
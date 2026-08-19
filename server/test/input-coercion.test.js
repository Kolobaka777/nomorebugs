// A validation that could not fail. `parseInt(x, 10)` yields an integer or
// NaN and nothing else, so `Number.isInteger(parseInt(x))` only ever caught
// "not a number at all" — while parseInt itself quietly salvaged a prefix
// from anything else. A bonus of 1.5 became 1, "50 руб" became 50, and
// "10; DROP TABLE users" became 10: each accepted, acted on, and recorded
// in the audit log as a figure nobody had typed.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { toInt, toPositiveInt } = await import('../src/routeHelpers.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken;

const asLead = req => req.set('Authorization', `Bearer ${leadToken}`);
const points = userId =>
  db.prepare('SELECT COALESCE(premium_points, 0) p FROM user_profiles WHERE user_id = ?').get(userId)?.p ?? 0;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

describe('toInt / toPositiveInt', () => {
  it('refuses the whole value instead of salvaging a prefix', () => {
    for (const bad of ['10; DROP TABLE users', '50 руб', '3abc', 'abc', 1.5, '1.5', {}, [], true]) {
      expect(toInt(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('accepts a real integer, however it was written', () => {
    // A JSON API; "5" is a reasonable way to send five.
    expect(toInt(5)).toBe(5);
    expect(toInt('5')).toBe(5);
    expect(toInt(' 7 ')).toBe(7);
    expect(toInt(0)).toBe(0);
    expect(toInt(-3)).toBe(-3);
  });

  it('treats absent as absent rather than as zero', () => {
    for (const empty of [null, undefined, '']) expect(toInt(empty)).toBeNull();
  });

  it('adds only the sign check on top', () => {
    expect(toPositiveInt(0)).toBeNull();
    expect(toPositiveInt(-3)).toBeNull();
    expect(toPositiveInt(3)).toBe(3);
  });
});

describe('awarding a bonus', () => {
  it('refuses a fraction rather than rounding it in silence', async () => {
    const before = points(fixtures.testerId);
    const res = await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: fixtures.testerId, amount: 1.5, reason: 'дробь' });
    expect(res.status).toBe(400);
    expect(points(fixtures.testerId)).toBe(before);
  });

  it('refuses a number with something stuck to it', async () => {
    const before = points(fixtures.testerId);
    for (const amount of ['10; DROP TABLE users', '50 руб', '7abc']) {
      const res = await asLead(request(server).post('/api/lead/award-bonus'))
        .send({ user_id: fixtures.testerId, amount, reason: 'мусор' });
      expect(res.status, String(amount)).toBe(400);
    }
    expect(points(fixtures.testerId)).toBe(before);
  });

  it('refuses a target id with something stuck to it', async () => {
    // parseInt('2abc') is 2 — a real person, and not the one that was asked
    // for. The audit line would then name someone nobody chose.
    const res = await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: `${fixtures.testerId}abc`, amount: 10, reason: 'кому?' });
    expect(res.status).toBe(400);
  });

  it('still pays an ordinary award, sent either as a number or as a string', async () => {
    const before = points(fixtures.testerId);
    const asNumber = await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: fixtures.testerId, amount: 10, reason: 'нашёл баг' });
    expect(asNumber.status).toBe(200);

    const asString = await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: String(fixtures.testerId), amount: '5', reason: 'и ещё один' });
    expect(asString.status).toBe(200);

    expect(points(fixtures.testerId)).toBe(before + 15);
  });

  it('records in the log exactly what was paid', async () => {
    await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: fixtures.testerId, amount: 42, reason: 'за дело' });
    const row = db.prepare(
      "SELECT action FROM activity_log WHERE action LIKE 'bonus_awarded:%' ORDER BY id DESC LIMIT 1"
    ).get();
    expect(row.action).toBe(`bonus_awarded:target=${fixtures.testerId}:amount=42`);
  });
});

describe('other places the same shape lived', () => {
  it('rejects a malformed course id on a favourite', async () => {
    const res = await asLead(request(server).post('/api/tester/favorites'))
      .send({ course_type: 'custom', course_id: '1abc' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed course id on a note', async () => {
    const res = await asLead(request(server).post('/api/tester/notes'))
      .send({ course_id: '1abc', lesson_title: 'L', text: 'заметка' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed target when granting a permission', async () => {
    const res = await asLead(request(server).post('/api/lead/permissions'))
      .send({ user_id: `${fixtures.testerId}abc`, permission: 'manage_guides' });
    expect(res.status).toBe(400);
  });
});

// The lead's audit log. Before this, the log recorded learning and a
// handful of admin actions and nothing else — a course could be deleted, a
// news item removed, a bonus paid or an account locked out, and none of it
// left a trace anywhere a lead could look.
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
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken;

const asLead = req => req.set('Authorization', `Bearer ${leadToken}`);
const log = (params = {}) => asLead(request(server).get('/api/lead/activity').query(params));
const actionsIn = res => res.body.rows.map(r => r.action);

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
});

describe('what reaches the log', () => {
  it('records a news item being posted and removed, by its text', async () => {
    const posted = await asLead(request(server).post('/api/team/news')).send({ text: 'Завтра релиз' });
    expect(posted.status).toBe(200);

    await asLead(request(server).delete(`/api/team/news/${posted.body.id}`));

    const actions = actionsIn(await log({ category: 'content' }));
    expect(actions).toContain('news_posted:Завтра релиз');
    // The row is gone by the time the line is written — the text has to be
    // read before the DELETE or the log says only "something was deleted".
    expect(actions).toContain('news_deleted:Завтра релиз');
  });

  it('records a course through create, publish and delete', async () => {
    const created = await asLead(request(server).post('/api/custom-courses')).send({
      title: 'Основы багрепорта',
      modules: [{ title: 'Модуль', lessons: [{ title: 'Урок', type: 'lesson', content: 'тело' }] }],
    });
    expect(created.status).toBe(200);
    const id = created.body.id;

    await asLead(request(server).patch(`/api/custom-courses/${id}/publish`));
    await asLead(request(server).patch(`/api/custom-courses/${id}/publish`));
    await asLead(request(server).delete(`/api/custom-courses/${id}`));

    const actions = actionsIn(await log({ category: 'content', q: 'Основы багрепорта' }));
    expect(actions).toContain('course_created:Основы багрепорта');
    expect(actions).toContain('course_published:Основы багрепорта');
    expect(actions).toContain('course_unpublished:Основы багрепорта');
    expect(actions).toContain('course_deleted:Основы багрепорта');
  });

  it('records a bonus with who got it and how much', async () => {
    const res = await asLead(request(server).post('/api/lead/award-bonus'))
      .send({ user_id: fixtures.testerId, amount: 100, reason: 'нашёл критичный баг' });
    expect(res.status).toBe(200);

    expect(actionsIn(await log({ category: 'admin' })))
      .toContain(`bonus_awarded:target=${fixtures.testerId}:amount=100`);
  });

  it('records a failed login, and the lockout once rather than every time', async () => {
    const email = 'locked@test.local';
    db.prepare("INSERT INTO users (email, password, name, role) VALUES (?, 'x', 'Locked One', 'tester')").run(email);
    const id = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;

    // MAX_FAILED_LOGIN_ATTEMPTS is 8; the 8th trips the lockout and the
    // 9th is refused before the password is even checked.
    for (let i = 0; i < 9; i++) {
      await request(server).post('/api/auth/login').send({ email, password: 'wrong' });
    }

    const mine = db.prepare('SELECT action FROM activity_log WHERE user_id = ?').all(id).map(r => r.action);
    expect(mine.filter(a => a === 'login_failed')).toHaveLength(7);
    expect(mine.filter(a => a === 'account_locked')).toHaveLength(1);
  });

  it('leaves no row for an attempt against an email that has no account', async () => {
    const before = db.prepare('SELECT COUNT(*) c FROM activity_log').get().c;
    await request(server).post('/api/auth/login')
      .send({ email: 'nobody-here@test.local', password: 'wrong' });
    // user_id is NOT NULL and there is nobody to attribute it to. The
    // response is byte-identical to a wrong password on a real account, so
    // this is not an enumeration signal either way.
    expect(db.prepare('SELECT COUNT(*) c FROM activity_log').get().c).toBe(before);
  });
});

describe('filtering', () => {
  it('labels every row with a category', async () => {
    const res = await log({ offset: 0 });
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const row of res.body.rows) {
      expect(['learning', 'content', 'admin', 'account', 'other']).toContain(row.category);
    }
  });

  it('returns only the asked-for category', async () => {
    const res = await log({ category: 'account' });
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const row of res.body.rows) expect(row.category).toBe('account');
  });

  it('shows everything when the category is not one it knows', async () => {
    const bogus = await log({ category: 'не-категория' });
    const all = await log({ offset: 0 });
    expect(bogus.body.rows.length).toBe(all.body.rows.length);
  });

  it('narrows to one person', async () => {
    const res = await log({ user_id: fixtures.testerId });
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const row of res.body.rows) expect(row.user_id).toBe(fixtures.testerId);
  });

  it('searches the action text and the person\'s name with one box', async () => {
    const byTitle = await log({ q: 'Завтра релиз' });
    expect(byTitle.body.rows.length).toBeGreaterThan(0);

    const byName = await log({ q: 'Test Tester' });
    expect(byName.body.rows.length).toBeGreaterThan(0);
    for (const row of byName.body.rows) expect(row.name).toBe('Test Tester');
  });

  it('combines a category, a person and a search into one query', async () => {
    const res = await log({ category: 'admin', user_id: fixtures.leadId, q: 'bonus' });
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const row of res.body.rows) {
      expect(row.category).toBe('admin');
      expect(row.user_id).toBe(fixtures.leadId);
      expect(row.action).toContain('bonus');
    }
  });

  it('includes the whole of the day named as the range end', async () => {
    // Everything in this file happened today. A naive `created_at <= to`
    // compares against midnight and returns nothing — the exact filter a
    // lead reaches for first ("from the 1st to today") would look like an
    // empty log.
    const today = new Date().toISOString().slice(0, 10);
    const res = await log({ from: today, to: today });
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('returns nothing for a range that ended before anything happened', async () => {
    const res = await log({ from: '2020-01-01', to: '2020-01-02' });
    expect(res.body.rows).toEqual([]);
    expect(res.body.hasMore).toBe(false);
  });

  it('ignores a date that is not a date', async () => {
    const res = await log({ from: "2020-01-01' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);
  });

  it('pages a filtered log without losing the filter', async () => {
    const first = await log({ category: 'content', offset: 0 });
    const second = await log({ category: 'content', offset: first.body.rows.length });
    for (const row of second.body.rows) expect(row.category).toBe('content');
    const ids = new Set(first.body.rows.map(r => r.id));
    for (const row of second.body.rows) expect(ids.has(row.id)).toBe(false);
  });

  it('stays lead-only', async () => {
    const res = await request(server).get('/api/lead/activity')
      .set('Authorization', `Bearer ${testerToken}`).query({ category: 'admin' });
    expect(res.status).toBe(403);
  });
});

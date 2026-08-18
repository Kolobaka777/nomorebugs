// One name, everywhere. users.name is what an account registered with;
// user_profiles.nickname is what the person actually goes by. They used to
// disagree in every list — someone renamed themselves and the news feed,
// the bylines and the team page kept crediting the old name. See
// displayName() in src/routeHelpers.js.
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
// Deliberately not 'Alex Lead' — the non-production seed creates a demo
// account by that name, and a second user sharing it would make the
// "old name is gone" assertions pass or fail for the wrong reason.
const OLD_NAME = 'Alex Before-Rename';
const NICKNAME = "I'm BOSS";

let fixtures, leadToken, testerToken, renamedId;

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  renamedId = fixtures.leadId;

  // The account keeps its registration name throughout — the point is that
  // nothing displays it once a nickname exists.
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(OLD_NAME, renamedId);

  // Things authored under the old name, before the rename.
  const guide = await request(server).post('/api/guides').set('Authorization', `Bearer ${leadToken}`)
    .send({ title: 'Гайд до переименования', category: 'Общее', content: 'тело' });
  await request(server).patch(`/api/guides/${guide.body.id}/publish`).set('Authorization', `Bearer ${leadToken}`).catch(() => {});
  await request(server).post('/api/suggestions').set('Authorization', `Bearer ${leadToken}`)
    .send({ type: 'idea', text: 'Идея до переименования', is_anonymous: false });
  db.prepare("INSERT INTO team_events (event_type, user_id) VALUES ('member_joined', ?)").run(renamedId);

  // ...and only then the rename.
  await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${leadToken}`)
    .send({ nickname: NICKNAME });
});

// Every one of these is a place the old name used to survive a rename.
const PLACES = [
  ['the news feed', '/api/team/news', body => body.rows.map(r => r.name)],
  ['the presence list', '/api/team/presence', body => body.map(r => r.name)],
  ['guide bylines', '/api/guides', body => body.map(r => r.author_name)],
  ['the ideas board', '/api/suggestions', body => body.rows.map(r => r.author_name)],
];

describe('a rename reaches every list', () => {
  for (const [label, url, pick] of PLACES) {
    it(`${label} shows the nickname, not the account name`, async () => {
      const res = await request(server).get(url).set('Authorization', `Bearer ${testerToken}`);
      expect(res.status).toBe(200);
      const names = pick(res.body).filter(Boolean);
      // Guard against the assertion passing on an empty list.
      expect(names.length).toBeGreaterThan(0);
      expect(names).toContain(NICKNAME);
      expect(names).not.toContain(OLD_NAME);
    });
  }

  it("the lead's own team view is not an exception", async () => {
    const res = await request(server).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.map(m => m.name)).not.toContain(OLD_NAME);
  });

  it('the admin user list follows too, and keeps the account name alongside it', async () => {
    const adminToken = await loginAs(request, server, 'admin@test.local', 'adminpass123');
    const res = await request(server).get('/api/admin/users').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.find(u => u.id === renamedId);
    expect(row.name).toBe(NICKNAME);
    expect(row.account_name).toBe(OLD_NAME); // still recoverable, just not what's shown
  });

  it('an empty nickname falls back to the account name rather than showing a blank', async () => {
    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${leadToken}`)
      .send({ nickname: '' });
    const res = await request(server).get('/api/team/presence').set('Authorization', `Bearer ${testerToken}`);
    const row = res.body.find(u => u.id === renamedId);
    expect(row.name).toBe(OLD_NAME);

    await request(server).put('/api/tester/profile').set('Authorization', `Bearer ${leadToken}`)
      .send({ nickname: NICKNAME });
  });

  // The whole point of deriving the name instead of copying it into rows.
  it('applies to rows written long before the rename, without a migration', async () => {
    const res = await request(server).get('/api/team/news').set('Authorization', `Bearer ${testerToken}`);
    const joined = res.body.rows.find(r => r.event_type === 'member_joined' && r.user_id === renamedId);
    expect(joined).toBeTruthy();
    expect(joined.name).toBe(NICKNAME);
  });
});

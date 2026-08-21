// Paid and earned cosmetics. The shop deducts coins and badges are earned;
// the point of these is that neither can be skipped by saving a profile
// that simply claims the item.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { DEFAULT_AVATAR_ID, FREE_BG_IDS, SKILL_BADGES } = await import('../src/entitlements.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
const fixtures = seedTestData(db);
const token = await loginAs(request, server, 'tester@test.local', 'testerpass123');

const save = body => request(server).put('/api/tester/profile').set('Authorization', `Bearer ${token}`).send(body);
const stored = () => db.prepare('SELECT avatar_id, avatar_frame, profile_bg FROM user_profiles WHERE user_id = ?').get(fixtures.testerId) || {};

beforeEach(() => {
  db.prepare('DELETE FROM user_badges WHERE user_id = ?').run(fixtures.testerId);
  db.prepare(`
    INSERT INTO user_profiles (user_id, bug_coins, purchased_items, avatar_id, avatar_frame, profile_bg)
    VALUES (?, 0, '[]', ?, 'default', 'default')
    ON CONFLICT(user_id) DO UPDATE SET
      bug_coins = 0, purchased_items = '[]', avatar_id = excluded.avatar_id,
      avatar_frame = 'default', profile_bg = 'default'
  `).run(fixtures.testerId, DEFAULT_AVATAR_ID);
});

describe('equipping what you do not own', () => {
  it('refuses the 350-coin frame to a tester who never bought it', async () => {
    const res = await save({ nickname: 'Халявщик', avatar_frame: 'rainbow' });
    expect(res.status).toBe(403);
    expect(stored().avatar_frame).toBe('default');
  });

  it('refuses the 250-coin background too, and saves nothing else from that request', async () => {
    const res = await save({ nickname: 'Халявщик', profile_bg: 'amber' });
    expect(res.status).toBe(403);
    expect(stored().profile_bg).toBe('default');
    // The whole save is rejected — a refused cosmetic must not let the rest
    // of the body through, or the request half-applies.
    expect(db.prepare('SELECT nickname FROM user_profiles WHERE user_id = ?').get(fixtures.testerId).nickname).not.toBe('Халявщик');
  });

  it('refuses the shop-priced avatar', async () => {
    expect((await save({ avatar_id: 'frog1' })).status).toBe(403);
  });

  it('allows it once it is actually bought', async () => {
    db.prepare("UPDATE user_profiles SET purchased_items = '[\"frame_rainbow\"]' WHERE user_id = ?").run(fixtures.testerId);
    expect((await save({ avatar_frame: 'rainbow' })).status).toBe(200);
    expect(stored().avatar_frame).toBe('rainbow');
  });

  it('allows it once it is actually earned', async () => {
    db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(fixtures.testerId, 'CSS reading');
    expect((await save({ avatar_frame: 'rainbow' })).status).toBe(200);
  });

  it('lets every free background through without anything owned', async () => {
    for (const bg of FREE_BG_IDS) {
      expect((await save({ profile_bg: bg })).status).toBe(200);
    }
  });

  it('keeps letting an account wear what it already has on', async () => {
    // An entitlement rule can change under an account that is already
    // dressed; that must not undress it on its next unrelated save.
    db.prepare("UPDATE user_profiles SET avatar_id = 'frog1' WHERE user_id = ?").run(fixtures.testerId);
    expect((await save({ nickname: 'Старожил', avatar_id: 'frog1' })).status).toBe(200);
  });
});

describe('what "скрафти все значки" counts', () => {
  it('does not accept achievements in place of crafted badges', async () => {
    for (const id of ['achievement_avtor', 'achievement_otlichnik', 'achievement_nastavnik',
                      'achievement_bibliotekar', 'achievement_polunochny_zhuk']) {
      db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(fixtures.testerId, id);
    }
    // Five badge rows, not one of them a crafted skill badge.
    expect((await save({ avatar_frame: 'crown' })).status).toBe(403);
    expect((await save({ profile_bg: 'amber' })).status).toBe(403);
  });

  it('accepts the five crafted badges', async () => {
    for (const id of SKILL_BADGES) db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(fixtures.testerId, id);
    expect((await save({ avatar_frame: 'crown' })).status).toBe(200);
    expect((await save({ profile_bg: 'amber' })).status).toBe(200);
  });
});

describe('the list the profile page draws its locks from', () => {
  it('is the same rule that refuses a save', async () => {
    const res = await request(server).get('/api/tester/entitlements').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Everything it offers is actually accepted...
    for (const frame of res.body.frames) expect((await save({ avatar_frame: frame })).status).toBe(200);
    for (const bg of res.body.bgs) expect((await save({ profile_bg: bg })).status).toBe(200);
    // ...and something it withholds is not.
    expect(res.body.frames).not.toContain('rainbow');
    expect((await save({ avatar_frame: 'rainbow' })).status).toBe(403);
  });

  it('never offers a default the account cannot wear', async () => {
    const res = await request(server).get('/api/tester/entitlements').set('Authorization', `Bearer ${token}`);
    expect(res.body.avatars).toContain(DEFAULT_AVATAR_ID);
  });
});

describe('what the account already wears', () => {
  it('is on its own list, so the profile page never prices what you have on', async () => {
    // The state every new account was in: the column default handed out the
    // shop's one priced frog, and the picker drew it equipped and for sale.
    db.prepare("UPDATE user_profiles SET avatar_id = 'frog1' WHERE user_id = ?").run(fixtures.testerId);
    const res = await request(server).get('/api/tester/entitlements').set('Authorization', `Bearer ${token}`);
    expect(res.body.avatars).toContain('frog1');
  });

  it('does not thereby hand out anything else from the shop', async () => {
    db.prepare("UPDATE user_profiles SET avatar_id = 'frog1' WHERE user_id = ?").run(fixtures.testerId);
    const res = await request(server).get('/api/tester/entitlements').set('Authorization', `Bearer ${token}`);
    expect(res.body.frames).not.toContain('rainbow');
    expect(res.body.bgs).not.toContain('amber');
  });
});

// Saving part of a profile must not erase the rest of it.
//
// The profile page equips a frame, a background or an avatar by sending that
// one field. The same endpoint is also the edit modal's full save, and it
// used to write all fifteen columns from whatever arrived — so one click on a
// frame blanked the nickname, the quote, the specialization, the info box,
// gender, the accent colour, the showcase badges and the uploaded avatar, and
// turned a public profile private. Buying a frame did it as well.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
const fixtures = seedTestData(db);
const token = await loginAs(request, server, 'tester@test.local', 'testerpass123');

const save = body => request(server).put('/api/tester/profile').set('Authorization', `Bearer ${token}`).send(body);
const row = () => db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(fixtures.testerId);

const FULL = {
  nickname: 'Назарий',
  status_quote: 'ищу баги',
  specialization: 'Мануальный QA',
  info_box: 'обо мне',
  snail_joke: 'улитка',
  gender: 'male',
  profile_accent_color: '#EF9F27',
  profile_bg: 'forest',
  avatar_frame: 'default',
  showcase_badges: ['achievement_avtor'],
  is_public: true,
};

beforeEach(async () => {
  await save(FULL);
});

describe('equipping one thing', () => {
  it('leaves every other field of the profile alone', async () => {
    const res = await save({ avatar_frame: 'code' });
    expect(res.status).toBe(200);

    const after = row();
    expect(after.avatar_frame).toBe('code');
    expect(after.nickname).toBe('Назарий');
    expect(after.status_quote).toBe('ищу баги');
    expect(after.specialization).toBe('Мануальный QA');
    expect(after.info_box).toBe('обо мне');
    expect(after.snail_joke).toBe('улитка');
    expect(after.gender).toBe('male');
    expect(after.profile_accent_color).toBe('#EF9F27');
    expect(after.profile_bg).toBe('forest');
    expect(JSON.parse(after.showcase_badges)).toEqual(['achievement_avtor']);
  });

  it('does not quietly make a public profile private', async () => {
    expect(row().is_public).toBe(1);
    await save({ profile_bg: 'ink' });
    expect(row().is_public).toBe(1);
  });

  it('keeps an uploaded avatar when only the frame changes', async () => {
    db.prepare("UPDATE user_profiles SET custom_avatar = 'data:image/png;base64,AAA' WHERE user_id = ?").run(fixtures.testerId);
    await save({ avatar_frame: 'code' });
    expect(row().custom_avatar).toBe('data:image/png;base64,AAA');
  });

  it('keeps the nickname, which is the name every list in the app shows', async () => {
    // displayName() falls back to users.name, so losing the nickname here
    // renames the person in the news feed, the team page and the ratings.
    await save({ profile_bg: 'moss' });
    const shown = db.prepare('SELECT nickname FROM user_profiles WHERE user_id = ?').get(fixtures.testerId);
    expect(shown.nickname).toBe('Назарий');
  });
});

describe('the edit modal, which sends everything', () => {
  it('can still empty a field on purpose', async () => {
    await save({ ...FULL, status_quote: '', info_box: '' });
    expect(row().status_quote).toBeNull();
    expect(row().info_box).toBeNull();
  });

  it('can still turn a profile private on purpose', async () => {
    await save({ ...FULL, is_public: false });
    expect(row().is_public).toBe(0);
  });

  it('can still clear the showcase selection on purpose', async () => {
    await save({ ...FULL, showcase_badges: [] });
    expect(JSON.parse(row().showcase_badges)).toEqual([]);
  });
});

// The same shape of bug on the presence endpoint: the working-hours form has
// no status control, so it does not send one — and an absent status used to
// mean "back to active".
describe('saving working hours', () => {
  const presence = body => request(server).patch('/api/me/presence').set('Authorization', `Bearer ${token}`).send(body);
  const presenceRow = () => db.prepare('SELECT status, work_start, work_end, work_days, timezone FROM user_profiles WHERE user_id = ?').get(fixtures.testerId);

  it('does not put someone back in the office who said they were remote', async () => {
    await presence({ status: 'remote' });
    expect(presenceRow().status).toBe('remote');

    // Exactly the body the working-hours form sends.
    await presence({ work_start: '09:00', work_end: '18:00', work_days: '1,2,3,4,5', timezone: 'Europe/Moscow' });
    expect(presenceRow().status).toBe('remote');
    expect(presenceRow().work_start).toBe('09:00');
  });

  it('does not wipe the hours when only the status changes', async () => {
    await presence({ work_start: '11:00', work_end: '20:00', work_days: '2,3,4', timezone: 'Asia/Tbilisi' });
    await presence({ status: 'other' });

    const after = presenceRow();
    expect(after.status).toBe('other');
    expect(after.work_start).toBe('11:00');
    expect(after.work_end).toBe('20:00');
    expect(after.work_days).toBe('2,3,4');
    expect(after.timezone).toBe('Asia/Tbilisi');
  });

  it('still lets the hours be cleared on purpose', async () => {
    await presence({ work_start: '09:00', work_end: '18:00' });
    await presence({ work_start: null, work_end: null });
    expect(presenceRow().work_start).toBeNull();
    expect(presenceRow().work_end).toBeNull();
  });
});

// The frog's closing lines on a course result screen — one for passing, one
// for not, set per course in the builder. Empty means "use the default",
// which is a client-side decision (utils/courseResult.ts); the server's job
// is to store what was typed and nothing more.
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
let leadToken;

const makeCourse = (body) =>
  request(server).post('/api/custom-courses').set('Authorization', `Bearer ${leadToken}`)
    .send({ title: 'Курс', modules: [], ...body });

beforeAll(async () => {
  seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

describe('course result text', () => {
  it('round-trips both lines through create and read', async () => {
    const created = await makeCourse({
      title: 'Тест с фразами',
      success_text: 'Ну всё, ты свой.',
      fail_text: 'Тебе бы перечитать.',
    });
    expect(created.status).toBe(200);

    const res = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.body.success_text).toBe('Ну всё, ты свой.');
    expect(res.body.fail_text).toBe('Тебе бы перечитать.');
  });

  it('stores empty strings when the author skips them, so the client can fall back', async () => {
    const created = await makeCourse({ title: 'Курс без фраз' });
    const res = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.body.success_text).toBe('');
    expect(res.body.fail_text).toBe('');
  });

  it('trims and caps, so one line stays one line', async () => {
    const created = await makeCourse({
      title: 'Длинная фраза',
      success_text: '   с пробелами по краям   ',
      fail_text: 'я'.repeat(500),
    });
    const res = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.body.success_text).toBe('с пробелами по краям');
    expect(res.body.fail_text.length).toBe(300);
  });

  it('updates them without touching anything else', async () => {
    const created = await makeCourse({ title: 'Правим фразы', success_text: 'старая', fail_text: 'старая' });
    const before = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);

    await request(server).put(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`)
      .send({ success_text: 'новая успешная', fail_text: 'новая провальная' });

    const after = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(after.body.success_text).toBe('новая успешная');
    expect(after.body.fail_text).toBe('новая провальная');
    expect(after.body.title).toBe(before.body.title);
  });

  // A metadata save that doesn't mention them must not wipe them — the
  // builder sends the whole form, but a direct API call need not.
  it('leaves them alone when an update does not mention them', async () => {
    const created = await makeCourse({ title: 'Не трогать', success_text: 'сохранись', fail_text: 'и ты тоже' });
    await request(server).put(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`)
      .send({ title: 'Переименован' });

    const res = await request(server).get(`/api/custom-courses/${created.body.id}`).set('Authorization', `Bearer ${leadToken}`);
    expect(res.body.title).toBe('Переименован');
    expect(res.body.success_text).toBe('сохранись');
    expect(res.body.fail_text).toBe('и ты тоже');
  });
});

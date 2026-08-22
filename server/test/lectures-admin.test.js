// Attaching a video to a lecture is all this router does now that the task
// types lookup is gone. Coverage was 44%.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let fixtures, leadToken, testerToken, lectureId;

const setVideo = (token, id, video_url) =>
  request(server).patch(`/api/admin/lectures/${id}/video`).set('Authorization', `Bearer ${token}`).send({ video_url });

beforeAll(async () => {
  fixtures = seedTestData(db);
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  lectureId = db.prepare('SELECT id FROM lectures ORDER BY order_num LIMIT 1').get().id;
});

beforeEach(() => {
  db.prepare('UPDATE lectures SET video_url = NULL').run();
  db.prepare("DELETE FROM team_events WHERE event_type = 'lecture_video_added'").run();
});

describe('who may edit', () => {
  it('lets a lead see the lecture list', async () => {
    const res = await request(server).get('/api/admin/lectures').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('video_url');
  });

  it('refuses a tester', async () => {
    expect((await request(server).get('/api/admin/lectures').set('Authorization', `Bearer ${testerToken}`)).status).toBe(403);
    expect((await setVideo(testerToken, lectureId, 'https://youtube.com/watch?v=x')).status).toBe(403);
  });
});

describe('the video link', () => {
  it('is saved and comes back in the list', async () => {
    expect((await setVideo(leadToken, lectureId, 'https://youtube.com/watch?v=abc')).status).toBe(200);
    const list = await request(server).get('/api/admin/lectures').set('Authorization', `Bearer ${leadToken}`);
    expect(list.body.find(l => l.id === lectureId).video_url).toBe('https://youtube.com/watch?v=abc');
  });

  it('has to be https, or the browser blocks it anyway', async () => {
    const res = await setVideo(leadToken, lectureId, 'http://youtube.com/watch?v=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/https/);
  });

  it('is cleared by an empty value', async () => {
    await setVideo(leadToken, lectureId, 'https://youtube.com/watch?v=abc');
    expect((await setVideo(leadToken, lectureId, '')).status).toBe(200);
    expect(db.prepare('SELECT video_url FROM lectures WHERE id = ?').get(lectureId).video_url).toBeNull();
  });

  it('answers 404 for a lecture that does not exist, not a quiet success', async () => {
    expect((await setVideo(leadToken, 999999, 'https://youtube.com/watch?v=abc')).status).toBe(404);
  });
});

describe('the unfamiliar-host warning', () => {
  it('stays quiet for the hosts people actually use', async () => {
    for (const url of [
      'https://youtube.com/watch?v=a', 'https://youtu.be/a', 'https://drive.google.com/file/d/a',
      'https://vk.com/video1', 'https://vkvideo.ru/video1', 'https://disk.yandex.ru/i/a',
    ]) {
      db.prepare('UPDATE lectures SET video_url = NULL WHERE id = ?').run(lectureId);
      expect((await setVideo(leadToken, lectureId, url)).body.warning).toBeNull();
    }
  });

  it('warns about the rest but saves them anyway', async () => {
    // A warning, not a refusal: the host list is a hint, not a policy.
    const res = await setVideo(leadToken, lectureId, 'https://example.com/video.mp4');
    expect(res.status).toBe(200);
    expect(res.body.warning).toMatch(/не из привычного списка/);
    expect(db.prepare('SELECT video_url FROM lectures WHERE id = ?').get(lectureId).video_url).toBe('https://example.com/video.mp4');
  });
});

describe('the team feed entry', () => {
  it('appears the first time a lecture becomes watchable', async () => {
    await setVideo(leadToken, lectureId, 'https://youtube.com/watch?v=abc');
    expect(db.prepare("SELECT COUNT(*) c FROM team_events WHERE event_type = 'lecture_video_added' AND ref_id = ?").get(lectureId).c).toBe(1);
  });

  it('does not repeat when an existing link is replaced', async () => {
    // Otherwise the feed fills up with every typo fixed in a URL.
    await setVideo(leadToken, lectureId, 'https://youtube.com/watch?v=abc');
    await setVideo(leadToken, lectureId, 'https://youtube.com/watch?v=def');
    expect(db.prepare("SELECT COUNT(*) c FROM team_events WHERE event_type = 'lecture_video_added' AND ref_id = ?").get(lectureId).c).toBe(1);
  });

  it('does not appear when a video is removed', async () => {
    await setVideo(leadToken, lectureId, '');
    expect(db.prepare("SELECT COUNT(*) c FROM team_events WHERE event_type = 'lecture_video_added' AND ref_id = ?").get(lectureId).c).toBe(0);
  });
});

describe('the task types lookup', () => {
  it('no longer exists, along with the feature it served', async () => {
    for (const call of [
      request(server).get('/api/admin/task-types'),
      request(server).post('/api/admin/task-types').send({ name: 'Что-нибудь' }),
      request(server).delete('/api/admin/task-types/1'),
    ]) {
      expect((await call.set('Authorization', `Bearer ${leadToken}`)).status).toBe(404);
    }
  });
});

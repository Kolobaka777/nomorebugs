import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs } = await import('./helpers.js');

let fixtures, testerToken, leadToken;

beforeAll(async () => {
  fixtures = seedTestData(db);
  testerToken = await loginAs(request, app, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, app, 'lead@test.local', 'leadpass123');
});

describe('lecture video links — always a pasted URL, never a file upload', () => {
  it('GET /api/lectures/:id returns null video_url by default', async () => {
    const res = await request(app).get(`/api/lectures/${fixtures.lec1Id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.video_url).toBeNull();
  });

  it('GET /api/admin/lectures is lead-only and lists every lecture', async () => {
    const asTester = await request(app).get('/api/admin/lectures').set('Authorization', `Bearer ${testerToken}`);
    expect(asTester.status).toBe(403);

    const asLead = await request(app).get('/api/admin/lectures').set('Authorization', `Bearer ${leadToken}`);
    expect(asLead.status).toBe(200);
    expect(asLead.body.length).toBeGreaterThanOrEqual(3);
  });

  it('a lead can set a YouTube link with no warning', async () => {
    const res = await request(app)
      .patch(`/api/admin/lectures/${fixtures.lec1Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(res.status).toBe(200);
    expect(res.body.warning).toBeFalsy();

    const check = await request(app).get(`/api/lectures/${fixtures.lec1Id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(check.body.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('a lead setting a link from an unrecognized host gets a soft warning, not a hard block', async () => {
    const res = await request(app)
      .patch(`/api/admin/lectures/${fixtures.lec2Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: 'https://example.com/webinar.mp4' });
    expect(res.status).toBe(200);
    expect(res.body.warning).toBeTruthy();

    const check = await request(app).get(`/api/lectures/${fixtures.lec2Id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(check.body.video_url).toBe('https://example.com/webinar.mp4');
  });

  it('rejects a non-https link', async () => {
    const res = await request(app)
      .patch(`/api/admin/lectures/${fixtures.lec1Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: 'http://insecure.example.com/video' });
    expect(res.status).toBe(400);
  });

  it('a tester cannot set a lecture video link', async () => {
    const res = await request(app)
      .patch(`/api/admin/lectures/${fixtures.lec1Id}/video`)
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ video_url: 'https://www.youtube.com/watch?v=abc' });
    expect(res.status).toBe(403);
  });

  it('an empty/null value clears the link', async () => {
    const res = await request(app)
      .patch(`/api/admin/lectures/${fixtures.lec1Id}/video`)
      .set('Authorization', `Bearer ${leadToken}`)
      .send({ video_url: null });
    expect(res.status).toBe(200);

    const check = await request(app).get(`/api/lectures/${fixtures.lec1Id}`).set('Authorization', `Bearer ${testerToken}`);
    expect(check.body.video_url).toBeNull();
  });
});

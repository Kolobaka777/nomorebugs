import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData, loginAs, testServer } = await import('./helpers.js');

const server = await testServer(app);
let testerToken, leadToken;

beforeAll(async () => {
  seedTestData(db);
  testerToken = await loginAs(request, server, 'tester@test.local', 'testerpass123');
  leadToken = await loginAs(request, server, 'lead@test.local', 'leadpass123');
});

const surveyBody = { html_structure: 3, css_reading: 3, devtools: 3, console_errors: 3, bug_report_quality: 3 };

describe('baseline survey — one-time by design', () => {
  // seedTestData already inserts one baseline_survey row for this tester —
  // this test exercises exactly the scenario that used to hit the UNIQUE
  // constraint and surface as a raw 500.
  it('a duplicate submission returns a clean 409, not a raw 500', async () => {
    const res = await request(server)
      .post('/api/tester/baseline-survey')
      .set('Authorization', `Bearer ${testerToken}`)
      .send(surveyBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
    expect(res.body.error).not.toMatch(/server error/i);
  });
});

describe('avatar size cap — server-side, not just client-side', () => {
  it('rejects an oversized custom_avatar even via a direct API call (bypassing the client check)', async () => {
    const oversized = 'a'.repeat(2.9 * 1024 * 1024); // between the 2.8MB validation cap and the 3mb body-parser limit
    const res = await request(server)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ custom_avatar: oversized });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/аватар/i);
  });

  it('accepts a real-world-sized avatar above the old (broken) 100kb body-parser default', async () => {
    // Regression check for the actual bug: express.json() previously had no
    // limit override, so it used Express's 100kb default — meaning any
    // avatar over ~75KB raw already 413'd before ever reaching app code,
    // regardless of the client's advertised 2MB cap. 500KB here is
    // comfortably within the intended cap and comfortably above 100kb.
    const reasonable = 'data:image/png;base64,' + 'a'.repeat(500 * 1024);
    const res = await request(server)
      .put('/api/tester/profile')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ custom_avatar: reasonable });
    expect(res.status).toBe(200);
  });
});

describe('lead/team skillGrowth (N+1 fix regression check)', () => {
  it('still computes a numeric skillGrowth per member after folding the per-member loop into one query', async () => {
    const res = await request(server).get('/api/lead/team').set('Authorization', `Bearer ${leadToken}`);
    expect(res.status).toBe(200);
    for (const member of res.body) {
      expect(typeof member.skillGrowth).toBe('number');
      expect(Number.isNaN(member.skillGrowth)).toBe(false);
      expect(member).not.toHaveProperty('baselineAvg'); // internal field, shouldn't leak into the API response
    }
  });
});

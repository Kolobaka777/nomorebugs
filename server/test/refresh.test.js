import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData } = await import('./helpers.js');
const { hashToken } = await import('../src/auth.js');
const { cleanupRefreshTokens } = await import('../src/app.js');

beforeAll(() => {
  seedTestData(db);
});

// The refresh token now travels as an httpOnly cookie, never in the JSON
// body — this pulls the raw value back out of the Set-Cookie header so
// tests can still inspect/manipulate the underlying refresh_tokens row.
function extractRefreshCookie(res) {
  const raw = (res.headers['set-cookie'] || []).find(c => c.startsWith('refreshToken='));
  if (!raw) return null;
  return decodeURIComponent(raw.split(';')[0].split('=')[1]);
}

async function login() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'tester@test.local', password: 'testerpass123' });
  return { body: res.body, refreshToken: extractRefreshCookie(res), res };
}

describe('POST /api/auth/login — token pair', () => {
  it('returns a short-lived access token and sets the refresh token as an httpOnly cookie, never in the JSON body', async () => {
    const { body, refreshToken, res } = await login();
    expect(typeof body.token).toBe('string');
    expect(body.refreshToken).toBeUndefined();
    expect(refreshToken).toBeTruthy();

    const cookieHeader = res.headers['set-cookie'].find(c => c.startsWith('refreshToken='));
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/Path=\/api\/auth/i);
  });

  it('persists only a hash of the refresh token, never the raw value', async () => {
    const { refreshToken } = await login();
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashToken(refreshToken));
    expect(row).toBeTruthy();
    expect(row.revoked_at).toBeNull();
    // The raw refresh token itself must not be recoverable from the stored row.
    expect(JSON.stringify(row)).not.toContain(refreshToken);
  });
});

describe('POST /api/auth/refresh', () => {
  it('exchanges the refresh cookie (persisted automatically by an agent, like a real browser) for a new access token', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });

    const res = await agent.post('/api/auth/refresh');
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    // The new access token actually works against a protected route.
    const lectures = await request(app).get('/api/tester/lectures').set('Authorization', `Bearer ${res.body.token}`);
    expect(lectures.status).toBe(200);
  });

  it('rejects when there is no refresh cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown refresh token cookie', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'refreshToken=not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects an expired refresh token', async () => {
    const { refreshToken } = await login();
    db.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?')
      .run(new Date(Date.now() - 1000).toISOString(), hashToken(refreshToken));

    const res = await request(app).post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshToken}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token so it can no longer be exchanged, and clears the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'tester@test.local', password: 'testerpass123' });

    const before = await agent.post('/api/auth/refresh');
    expect(before.status).toBe(200);

    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
    const clearedCookie = (logoutRes.headers['set-cookie'] || []).find(c => c.startsWith('refreshToken='));
    expect(clearedCookie).toMatch(/refreshToken=;/);

    const after = await agent.post('/api/auth/refresh');
    expect(after.status).toBe(401);
  });

  it('is a no-op (still 200) when called without a refresh cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
  });
});

describe('cleanupRefreshTokens', () => {
  it('deletes expired tokens and old-revoked tokens, leaves valid ones alone', async () => {
    const { refreshToken: valid } = await login();
    const { refreshToken: expired } = await login();
    const { refreshToken: recentlyRevoked } = await login();
    const { refreshToken: oldRevoked } = await login();

    db.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?')
      .run(new Date(Date.now() - 1000).toISOString(), hashToken(expired));
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?')
      .run(new Date().toISOString(), hashToken(recentlyRevoked));
    db.prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?')
      .run(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), hashToken(oldRevoked));

    cleanupRefreshTokens();

    const remaining = new Set(
      db.prepare('SELECT token_hash FROM refresh_tokens').all().map(r => r.token_hash)
    );
    expect(remaining.has(hashToken(valid))).toBe(true);
    expect(remaining.has(hashToken(recentlyRevoked))).toBe(true); // kept for the 7-day audit window
    expect(remaining.has(hashToken(expired))).toBe(false);
    expect(remaining.has(hashToken(oldRevoked))).toBe(false);
  });
});

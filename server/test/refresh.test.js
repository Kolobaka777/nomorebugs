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

async function login() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'tester@test.local', password: 'testerpass123' });
  return res.body;
}

describe('POST /api/auth/login — token pair', () => {
  it('returns both a short-lived access token and a refresh token', async () => {
    const body = await login();
    expect(typeof body.token).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.token).not.toBe(body.refreshToken);
  });

  it('persists only a hash of the refresh token, never the raw value', async () => {
    const body = await login();
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashToken(body.refreshToken));
    expect(row).toBeTruthy();
    expect(row.revoked_at).toBeNull();
    // The raw refresh token itself must not be recoverable from the stored row.
    expect(JSON.stringify(row)).not.toContain(body.refreshToken);
  });
});

describe('POST /api/auth/refresh', () => {
  it('exchanges a valid refresh token for a new access token', async () => {
    const { refreshToken } = await login();
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');

    // The new access token actually works against a protected route.
    const lectures = await request(app).get('/api/tester/lectures').set('Authorization', `Bearer ${res.body.token}`);
    expect(lectures.status).toBe(200);
  });

  it('rejects an unknown refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('rejects a missing refreshToken', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an expired refresh token', async () => {
    const { refreshToken } = await login();
    db.prepare('UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?')
      .run(new Date(Date.now() - 1000).toISOString(), hashToken(refreshToken));

    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token so it can no longer be exchanged', async () => {
    const { refreshToken } = await login();

    const before = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(before.status).toBe(200);

    const logoutRes = await request(app).post('/api/auth/logout').send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const after = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);
  });

  it('is a no-op (still 200) when called without a refreshToken', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
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

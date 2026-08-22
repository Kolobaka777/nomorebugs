// What the API answers when a request never reaches a route.
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

vi.mock('../src/telegram.js', () => ({ notifyUser: () => {}, notifyUserConfirmed: async () => 'none' }));

const { default: app } = await import('../src/app.js');
const { testServer } = await import('./helpers.js');
const server = await testServer(app);

describe('a malformed request body', () => {
  it('gets an answer in the API\'s own words, not the parser\'s internals', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    // This used to return "Unexpected end of JSON input" — an implementation
    // detail of body-parser surfacing as this API's contract.
    expect(res.body.error).toBe('Тело запроса не является корректным JSON');
    expect(res.body.error).not.toMatch(/JSON input|token|position/i);
  });

  it('gets a 413 with its own explanation when too large', async () => {
    const res = await request(server)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'x'.repeat(4 * 1024 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Тело запроса слишком большое');
  });
});

describe('every response carries its own id', () => {
  it('sets X-Request-Id on a successful response too', async () => {
    const res = await request(server).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

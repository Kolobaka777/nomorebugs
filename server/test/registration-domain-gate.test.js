// Optional signup allowlist — see REGISTRATION_ALLOWED_DOMAINS in
// src/routes/auth.js. The env var is read at module load, so it has to be set
// before app.js is imported.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.REGISTRATION_ALLOWED_DOMAINS = 'company.com, Company.ru';

vi.mock('../src/telegram.js', () => ({
  notifyUser: () => {},
  notifyUserConfirmed: async () => 'none',
}));

const { default: app } = await import('../src/app.js');
const { db } = await import('../db/schema.js');
const { seedTestData } = await import('./helpers.js');

beforeAll(() => seedTestData(db));

const signup = (email) => request(app).post('/api/auth/register')
  .send({ email, password: 'goodpassword1', name: 'Новичок' });

describe('registration domain allowlist', () => {
  it('lets an allowed domain through, case-insensitively', async () => {
    expect((await signup('someone@company.com')).status).toBe(201);
    expect((await signup('SomeoneElse@COMPANY.RU')).status).toBe(201);
  });

  it('turns away anything else', async () => {
    const res = await signup('stranger@gmail.com');
    expect(res.status).toBe(403);
    expect(db.prepare('SELECT id FROM users WHERE email = ?').get('stranger@gmail.com')).toBeUndefined();
  });

  it('matches the domain exactly — a lookalike suffix must not pass', async () => {
    expect((await signup('attacker@notcompany.com')).status).toBe(403);
    expect((await signup('attacker@company.com.evil.net')).status).toBe(403);
  });
});

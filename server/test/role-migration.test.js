import { describe, it, expect, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

// This migration (schema.js: dropping the old CHECK(role IN (...)) users
// constraint) only ever runs against a DB that still has the old
// constraint — every other test file uses a fresh `:memory:` DB, which
// never has it, so the migration path itself was never actually
// exercised by the suite. It was caught failing twice against the real
// dev DB during development (a `--watch` restart mid-rebuild left a
// stray `users_new` table; then a FOREIGN KEY constraint failure because
// this better-sqlite3 build defaults foreign_keys to ON, not SQLite's
// usual off). Both are covered here so they can't silently regress.
const dbPath = path.join(os.tmpdir(), `role-migration-test-${process.pid}.db`);

function cleanup() {
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
}

afterAll(cleanup);

function seedOldSchema() {
  cleanup();
  const raw = new Database(dbPath);
  raw.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('tester', 'lead')),
      avatar_initials TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      lecture_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  const userId = raw.prepare(
    "INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)"
  ).run('old-schema-user@test.local', 'hash', 'Old Schema User', 'lead', 'OS').lastInsertRowid;
  // A row in a child table that FK-references users — this is exactly
  // what made the naive DROP TABLE users fail under foreign_keys=ON.
  raw.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(userId, 'login');
  raw.close();
  return userId;
}

describe('users table role-constraint migration', () => {
  it('drops the old CHECK constraint, preserves rows and ids, and restores foreign_keys afterward', async () => {
    const originalUserId = seedOldSchema();

    process.env.DB_PATH = dbPath;
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
    // Bypass the module cache — a prior test file in the same run may
    // already have imported schema.js against a different DB_PATH.
    vi.resetModules();
    const { initDb, db } = await import('../db/schema.js');

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    initDb();

    const tableNames = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'users_new')"
    ).all().map(r => r.name);
    expect(tableNames).toEqual(['users']);

    const usersSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
    ).get();
    expect(usersSql.sql).not.toContain('CHECK(role IN');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(originalUserId);
    expect(user.email).toBe('old-schema-user@test.local');
    expect(user.role).toBe('lead');

    // The child row must have survived the rebuild with its FK intact.
    const activity = db.prepare('SELECT * FROM activity_log WHERE user_id = ?').get(originalUserId);
    expect(activity.action).toBe('login');

    // foreign_keys must be back on afterward, not left disabled.
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    db.close();
  });

  it('is idempotent — a second initDb() run against the already-migrated DB is a no-op, not an error', async () => {
    process.env.DB_PATH = dbPath;
    vi.resetModules();
    const { initDb, db } = await import('../db/schema.js');
    expect(() => initDb()).not.toThrow();
    const count = db.prepare('SELECT COUNT(*) as c FROM users').get();
    expect(count.c).toBeGreaterThan(0);
    db.close();
  });
});

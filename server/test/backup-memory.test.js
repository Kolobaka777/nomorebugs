import { describe, it, expect } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

const { isBackupEnabled, runBackup } = await import('../src/backup.js');

describe('backup.js against an in-memory DB (the normal test-suite configuration)', () => {
  it('isBackupEnabled() is false — nothing to back up, and better-sqlite3 cannot backup() a memory DB anyway', () => {
    expect(isBackupEnabled()).toBe(false);
  });

  it('runBackup() resolves to null instead of attempting anything', async () => {
    await expect(runBackup()).resolves.toBeNull();
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

const dbPath = path.join(os.tmpdir(), `backup-test-${process.pid}.db`);
const backupDir = path.join(os.tmpdir(), `backup-test-${process.pid}-backups`);

process.env.DB_PATH = dbPath;
process.env.BACKUP_DIR = backupDir;
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';

function cleanup() {
  for (const suffix of ['', '-shm', '-wal']) {
    if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
  }
  if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
}
cleanup();

const { db, initDb } = await import('../db/schema.js');
initDb();
const { isBackupEnabled, runBackup, pruneOldBackups, startBackupSchedule, stopBackupSchedule } = await import('../src/backup.js');

// Must close the connection before unlinking the file — Windows holds an
// exclusive lock on an open SQLite handle, unlike POSIX (unlinking an
// open file there just unlinks the directory entry, no error).
afterAll(() => {
  db.close();
  cleanup();
});

describe('backup.js against a real file-backed DB', () => {
  it('isBackupEnabled() is true for a file-backed database', () => {
    expect(isBackupEnabled()).toBe(true);
  });

  it('runBackup() writes a real, openable SQLite file containing the live data', async () => {
    db.prepare("INSERT INTO users (email, password, name, role, avatar_initials) VALUES ('backup-fixture@test.local', 'x', 'Backup Fixture', 'tester', 'BF')").run();

    const dest = await runBackup();
    expect(dest).toBeTruthy();
    expect(fs.existsSync(dest)).toBe(true);

    const copy = new Database(dest, { readonly: true });
    const row = copy.prepare("SELECT email FROM users WHERE email = 'backup-fixture@test.local'").get();
    expect(row?.email).toBe('backup-fixture@test.local');
    copy.close();
  });

  it('pruneOldBackups() keeps only the most recent MAX_BACKUPS (28) files', () => {
    fs.mkdirSync(backupDir, { recursive: true });
    // Filenames are zero-padded so plain string sort == chronological sort,
    // matching the real ISO-timestamp naming scheme's sort behavior.
    for (let i = 0; i < 35; i++) {
      fs.writeFileSync(path.join(backupDir, `backup-2026-01-${String(i).padStart(3, '0')}.db`), 'x');
    }
    pruneOldBackups();

    // .db-suffixed only, matching pruneOldBackups' own filter — the real
    // backup written by the previous test can carry -wal/-shm sidecars
    // (WAL-mode source), which aren't separate "backups" in their own right.
    const remaining = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-') && f.endsWith('.db'));
    expect(remaining.length).toBe(28);
    // The oldest-named files (lowest index) are the ones that should have
    // been pruned; the most recent 28 should survive.
    expect(remaining).not.toContain('backup-2026-01-000.db');
    expect(remaining).toContain('backup-2026-01-034.db');
  });

  it('pruning a .db file also removes its -wal/-shm sidecars, if present', () => {
    const stem = 'backup-2026-01-sidecar-fixture.db';
    fs.writeFileSync(path.join(backupDir, stem), 'x');
    fs.writeFileSync(path.join(backupDir, `${stem}-wal`), 'x');
    fs.writeFileSync(path.join(backupDir, `${stem}-shm`), 'x');
    // Push this fixture past MAX_BACKUPS by adding enough newer files that
    // it becomes the oldest and gets pruned on the next call.
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(backupDir, `backup-2026-02-${String(i).padStart(3, '0')}.db`), 'x');
    }
    pruneOldBackups();

    expect(fs.existsSync(path.join(backupDir, stem))).toBe(false);
    expect(fs.existsSync(path.join(backupDir, `${stem}-wal`))).toBe(false);
    expect(fs.existsSync(path.join(backupDir, `${stem}-shm`))).toBe(false);
  });

  it('startBackupSchedule()/stopBackupSchedule() do not throw and are idempotent', () => {
    expect(() => {
      startBackupSchedule();
      startBackupSchedule(); // second call should be a no-op, not a duplicate interval
      stopBackupSchedule();
      stopBackupSchedule(); // second call should be a no-op too
    }).not.toThrow();
  });
});

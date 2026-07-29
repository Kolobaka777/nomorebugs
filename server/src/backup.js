import path from 'path';
import fs from 'fs';
import { db } from '../db/schema.js';

// Writes into a subdirectory of wherever the live DB file lives — on
// Railway that's the same mounted volume, so this protects against
// logical corruption (a bad migration, an application bug that deletes
// the wrong rows) and gives an easy rollback point. It does NOT protect
// against losing the volume itself — that needs backups shipped
// off-volume (e.g. to S3), which isn't wired up here.
const BACKUP_DIR = process.env.BACKUP_DIR || (
  db.name !== ':memory:' ? path.join(path.dirname(db.name), 'backups') : null
);

const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const MAX_BACKUPS = 28; // 1 week of history at the 6h interval

export function isBackupEnabled() {
  return db.name !== ':memory:';
}

// better-sqlite3's backup() uses SQLite's own online backup API — it
// doesn't lock the live database for writes while it copies, so this is
// safe to run against a database still serving real traffic.
export async function runBackup() {
  if (!isBackupEnabled()) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP_DIR, `backup-${stamp}.db`);
  await db.backup(dest);
  pruneOldBackups();
  return dest;
}

// Exported for direct testing — otherwise only reachable indirectly via
// runBackup(), which would mean 28+ real backup() calls just to exercise
// rotation.
export function pruneOldBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .sort(); // ISO-derived timestamps in the filename sort chronologically as plain strings
  const excess = files.length - MAX_BACKUPS;
  for (let i = 0; i < excess; i++) {
    // A WAL-mode backup can leave -wal/-shm sidecars next to the .db file
    // (observed in practice, not just in theory) — removing only the .db
    // and leaving those behind would accumulate orphaned debris forever,
    // since nothing ever reopens an old backup to let SQLite clean them up.
    for (const suffix of ['', '-wal', '-shm']) {
      const p = path.join(BACKUP_DIR, files[i] + suffix);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
}

let intervalHandle = null;

// A no-op for ':memory:' (tests) — nothing to back up, and better-sqlite3's
// backup() would just error against a memory-only database anyway.
export function startBackupSchedule() {
  if (!isBackupEnabled() || intervalHandle) return;
  runBackup().catch(err => console.error('Initial DB backup failed:', err.message));
  intervalHandle = setInterval(() => {
    runBackup().catch(err => console.error('Scheduled DB backup failed:', err.message));
  }, BACKUP_INTERVAL_MS);
  intervalHandle.unref();
}

export function stopBackupSchedule() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

import path from 'path';
import fs from 'fs';
import { db } from '../db/schema.js';
import { logError } from './sentry.js';
import { isOffsiteBackupEnabled, uploadFile } from './s3.js';

// Re-exported so existing callers (app.js's startup warning, the tests)
// keep their import site. The implementation lives in s3.js, which the
// restore script also needs and which must not open the database.
export { isOffsiteBackupEnabled };

// Writes into a subdirectory of wherever the live DB file lives — on
// Railway that's the same mounted volume, so this protects against
// logical corruption (a bad migration, an application bug that deletes
// the wrong rows) and gives an easy rollback point. It does NOT protect
// against losing the volume itself on its own — see the off-site shipping
// below for that half of the story.
const BACKUP_DIR = process.env.BACKUP_DIR || (
  db.name !== ':memory:' ? path.join(path.dirname(db.name), 'backups') : null
);

// Off-site shipping — the actual fix for "the volume itself gets lost/
// corrupted" (disk failure, an accidental `railway volume delete`), which
// the on-volume backups above can't protect against by construction. No-op
// unless configured, matching the Sentry/SMTP/Telegram integrations'
// pattern elsewhere in this codebase — nothing breaks or changes behavior
// for a deployment that hasn't set these up. The S3 talking happens in
// s3.js; getting a copy *back* from there is scripts/restore-backup.js.
//
// Deliberately does its own try/catch and never throws — called from
// runBackup() right after a successful local backup, and a failed upload
// (bad credentials, network blip, bucket typo) should never make the
// otherwise-successful local backup cycle look like it failed. The next
// scheduled run tries again in BACKUP_INTERVAL_MS; nothing here retries
// within the same run.
export async function shipBackupOffsite(filePath) {
  if (!isOffsiteBackupEnabled()) return false;
  try {
    await uploadFile(filePath);
    return true;
  } catch (err) {
    logError(err, { context: 'off-site DB backup upload' });
    return false;
  }
}

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
  // Off-site copy of *this* backup only — not a re-upload of the whole
  // history each cycle. Remote-side pruning is left to the bucket's own
  // lifecycle rules (S3/R2/B2 all support "expire objects after N days"
  // natively) rather than reimplementing pruneOldBackups() a second time
  // against a remote API.
  await shipBackupOffsite(dest);
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
  // Was a bare console.error — a backup silently failing for days (a full
  // disk, a permissions change) had no chance of reaching anyone unless
  // someone happened to be tailing Railway's logs at the time.
  runBackup().catch(err => logError(err, { context: 'initial DB backup' }));
  intervalHandle = setInterval(() => {
    runBackup().catch(err => logError(err, { context: 'scheduled DB backup' }));
  }, BACKUP_INTERVAL_MS);
  intervalHandle.unref();
}

export function stopBackupSchedule() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

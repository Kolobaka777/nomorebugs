// Everything that happens once, at startup, before the first request: the
// pre-migration safety copy, the schema, the seeds, the long-running side
// channels and the periodic cleanups.
//
// Split out of app.js, which had grown to 467 lines of which barely half
// were about routing. None of this is per-request work and none of it
// belongs to a router. Keeping it here leaves app.js describing the HTTP
// surface and nothing else, and puts every "runs once, at boot" decision in
// one file where the order between them is visible — because the order is
// load-bearing: the safety backup has to precede initDb(), and the user
// seed has to precede the content seeds, which attribute everything they
// create to a real lead account.
import bcryptjs from 'bcryptjs';
import { db, initDb } from '../db/schema.js';
import { seedDemoContent } from '../db/seedDemoContent.js';
import { seedFrontendCourses } from '../db/seedFrontendCourses.js';
import { initTelegramBot, isTelegramConfigured } from './telegram.js';
import { isEmailConfigured } from './email.js';
import { startBackupSchedule, runBackup, isBackupEnabled, isOffsiteBackupEnabled } from './backup.js';
import { logError } from './sentry.js';

// Expired/revoked refresh tokens had no pruning — they'd accumulate in the
// table forever. Revoked tokens are kept for a short window (in case a
// revocation ever needs auditing) before being purged too. Runs once at
// startup and then daily; skipped in tests since a live setInterval would
// keep the test process alive after the suite finishes.
export function cleanupRefreshTokens() {
  const revokedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = db.prepare(
    'DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)'
  ).run(new Date().toISOString(), revokedCutoff);
  if (result.changes > 0 && process.env.NODE_ENV !== 'test') {
    console.log(`Cleaned up ${result.changes} expired/old-revoked refresh token(s)`);
  }

  // Telegram login/link tokens abandoned mid-flow (tab closed before
  // scanning, bot never messaged) — same TTL-expiry cleanup, just a much
  // shorter-lived table (5-minute TTL vs 30 days for refresh tokens).
  const tgResult = db.prepare('DELETE FROM telegram_login_tokens WHERE expires_at < ?').run(new Date().toISOString());
  if (tgResult.changes > 0 && process.env.NODE_ENV !== 'test') {
    console.log(`Cleaned up ${tgResult.changes} expired Telegram login token(s)`);
  }
}

// Async only for the pre-migration backup, which must finish before
// initDb() touches the schema it is a copy of.
export async function bootstrap() {
  // A snapshot taken right before initDb() runs its migrations — if a
  // migration ever goes wrong against real production data, this is the
  // point to restore from. Only in production (dev/test DBs are disposable),
  // and only best-effort: a backup failure must never block startup itself.
  if (process.env.NODE_ENV === 'production') {
    try {
      const dest = await runBackup();
      if (dest) console.log(`Pre-migration safety backup written to ${dest}`);
    } catch (err) {
      logError(err, { context: 'pre-migration safety backup' });
    }
  }

  initDb();

  // Long-polling connection to the Telegram Bot API — a no-op unless
  // TELEGRAM_BOT_TOKEN is set, and never started under tests (no real
  // network, and every test file importing app.js would otherwise spin up
  // its own competing poller against the same bot token).
  if (process.env.NODE_ENV !== 'test') {
    initTelegramBot();
    // Both channels are individually optional (each one no-ops quietly on
    // its own — see telegram.js/email.js), which is fine on its own, but if
    // NEITHER is configured every notifyUser() call in the app (new-login
    // alerts, permission grants, proposal approvals, achievement pings) goes
    // out into the void with nothing telling anyone it happened. That's a
    // one-time, loud, startup-only check — not a per-call one, so it doesn't
    // spam the log for every silent no-op notification afterwards.
    if (!isTelegramConfigured() && !isEmailConfigured()) {
      console.warn(
        'No notification channel configured (neither TELEGRAM_BOT_TOKEN nor SMTP_*) — ' +
        'security alerts and other user notifications will silently do nothing.'
      );
    }
  }

  // Periodic on-volume backups — a no-op for the ':memory:' DB tests use.
  // See backup.js for what this does and doesn't protect against.
  if (process.env.NODE_ENV !== 'test') {
    startBackupSchedule();

    // On-volume backups protect against "someone dropped a table". They do
    // not protect against losing the volume, which takes the live database
    // and all 28 rotations with it — the failure that actually ends a
    // deployment. The code for shipping them off-site exists and is tested;
    // it is inert until BACKUP_S3_* is set, and inert-by-default is exactly
    // the state that gets mistaken for done.
    if (isBackupEnabled() && !isOffsiteBackupEnabled() && process.env.NODE_ENV === 'production') {
      console.warn(
        'Бэкапы пишутся только на тот же том, где лежит база (BACKUP_S3_* не заданы). ' +
        'Потеря тома уносит и базу, и все её копии — см. DEPLOYMENT.md.'
      );
    }
  }

  // Auto-seed demo users if DB is empty — dev/test convenience only. Gated out
  // of production so a wiped volume or fresh prod deploy never silently stands
  // up accounts with published, guessable passwords (lead123/test123). A real
  // production first-boot should create its own admin via ADMIN_EMAIL/
  // ADMIN_PASSWORD env vars instead (see below).
  (function seedUsersIfEmpty() {
    const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();

    // NODE_ENV was the only thing standing between a real deployment and five
    // accounts whose passwords are published in this repository — and an
    // unset variable is not a decision, it is an omission. A deployment looks
    // nothing like a laptop: it binds a public PORT and has been told which
    // origins to serve. If those are set and NODE_ENV is not, refuse to start
    // rather than quietly seeding lead123 onto the internet.
    const looksDeployed = Boolean(process.env.CORS_ORIGIN || process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.FLY_APP_NAME);
    if (count === 0 && looksDeployed && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      throw new Error(
        'Отказ запуска: база пуста, окружение похоже на боевое (задан CORS_ORIGIN или переменная хостинга), ' +
        'а NODE_ENV не равен "production". Так были бы созданы демо-аккаунты с паролями из репозитория. ' +
        'Задайте NODE_ENV=production и ADMIN_EMAIL/ADMIN_PASSWORD.'
      );
    }

    if (count === 0 && process.env.NODE_ENV !== 'production') {
      const ins = db.prepare('INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)');
      ins.run('lead@qa.com',  bcryptjs.hashSync('lead123', 10), 'Alex Lead',      'lead',   'AL');
      ins.run('nazar@qa.com', bcryptjs.hashSync('test123', 10), 'Nazariy Tester', 'tester', 'NT');
      ins.run('gleb@qa.com',  bcryptjs.hashSync('test123', 10), 'Gleb Glebov',    'tester', 'GG');
      ins.run('alena@qa.com', bcryptjs.hashSync('test123', 10), 'Alena Expert',   'tester', 'AE');
      ins.run('vasya@qa.com', bcryptjs.hashSync('test123', 10), 'Vasya Novice',   'tester', 'VN');
      console.log('Users auto-seeded (non-production)');
    } else if (count === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const ins = db.prepare('INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)');
      ins.run(process.env.ADMIN_EMAIL, bcryptjs.hashSync(process.env.ADMIN_PASSWORD, 10), 'Admin', 'admin', 'AD');
      console.log(`Production admin account created for ${process.env.ADMIN_EMAIL}`);
    } else if (count === 0) {
      console.warn('No users in database and NODE_ENV=production: set ADMIN_EMAIL/ADMIN_PASSWORD env vars to bootstrap the first account, or seed manually.');
    }
  })();

  // Demo content — the joke quizzes, guides, bug examples and glossary terms
  // a fresh install opens with. Runs here rather than inside initDb() because
  // every item is attributed to a real lead, and on a first boot that account
  // is created by seedUsersIfEmpty just above. Skipped in tests: 10 courses
  // and ~120 questions per :memory: database would slow every test file down
  // for content none of them assert on (see test/demo-content.test.js, which
  // opts back in). Marker-guarded, so it inserts once and a lead deleting any
  // of it keeps it deleted.
  if (process.env.NODE_ENV !== 'test' || process.env.SEED_DEMO_CONTENT === '1') {
    seedDemoContent(db);
  }

  // The lead's three front-end lectures — HTML, CSS, JavaScript — as real
  // courses with modules and tests rather than slides in someone's notes. Same
  // marker-guarded, skipped-in-tests treatment as the demo content above, but
  // on its own marker and its own opt-in flag: the two seeds are separate
  // content that lands at separate times, and the demo-content test asserts an
  // exact course count that has nothing to do with these.
  if (process.env.NODE_ENV !== 'test' || process.env.SEED_LECTURES === '1') {
    seedFrontendCourses(db);
  }

  if (process.env.NODE_ENV !== 'test') {
    cleanupRefreshTokens();
    setInterval(cleanupRefreshTokens, 24 * 60 * 60 * 1000).unref();
  }
}

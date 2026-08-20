import 'dotenv/config';
// Must come before express/helmet/etc. below — see the comment in
// sentry.js for why this ordering is load-bearing, not stylistic.
import { Sentry, isSentryEnabled, logError } from './sentry.js';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { db, initDb } from '../db/schema.js';
import { seedDemoContent } from '../db/seedDemoContent.js';
import { seedFrontendCourses } from '../db/seedFrontendCourses.js';
import bcryptjs from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { initTelegramBot, isTelegramConfigured } from './telegram.js';
import { isEmailConfigured } from './email.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { startBackupSchedule, runBackup, isBackupEnabled, isOffsiteBackupEnabled } from './backup.js';
import knowledgeRouter from './routes/knowledge.js';
import suggestionsRouter from './routes/suggestions.js';
import newsRouter from './routes/news.js';
import frogLinesRouter from './routes/frogLines.js';
import presenceRouter from './routes/presence.js';
import leadRouter from './routes/lead.js';
import profileRouter from './routes/profile.js';
import lecturesAdminRouter from './routes/lecturesAdmin.js';
import coursesRouter from './routes/courses.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import testerRouter from './routes/tester.js';

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

// Expired/revoked refresh tokens had no pruning — they'd accumulate in the
// table forever. Revoked tokens are kept for a short window (in case a
// revocation ever needs auditing) before being purged too. Runs once at
// startup and then daily; skipped in tests since a live setInterval would
// keep the test process alive after the suite finishes.
function cleanupRefreshTokens() {
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
if (process.env.NODE_ENV !== 'test') {
  cleanupRefreshTokens();
  setInterval(cleanupRefreshTokens, 24 * 60 * 60 * 1000).unref();
}

// Allowed frontend origins for CORS — comma-separated in CORS_ORIGIN, defaults
// to the local Vite dev server so nothing breaks out of the box.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const app = express();
// Railway (and most PaaS hosts) terminates TLS at their own edge proxy and
// forwards the real client IP via X-Forwarded-For, one hop upstream of this
// container. Without this, express-rate-limit's own startup validation
// throws on exactly that header combination (X-Forwarded-For present,
// trust proxy unset), and even short of that, every rate limiter below
// would key off the proxy's IP instead of the actual caller's — sharing
// one bucket across every user. `1` (not `true`) trusts only that one
// known hop rather than any client-supplied X-Forwarded-For value, which
// would let a client spoof its own rate-limit key.
app.set('trust proxy', 1);
// This is a pure JSON API consumed by a separate client origin (different
// port in dev, different subdomain in most real deployments) — the default
// same-origin Cross-Origin-Resource-Policy would make browsers block the
// client's own fetch() calls to it, so that one default needs overriding.
// CSP is left at Helmet's default; it's inert on JSON responses (no HTML is
// ever served here) but costs nothing to have on in case that ever changes.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    // Allow non-browser requests (curl, server-to-server, tests) which send no Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    const err = new Error(`Origin ${origin} is not allowed by CORS`);
    err.status = 403;
    callback(err);
  },
  // The refresh token now travels as an httpOnly cookie (see
  // REFRESH_COOKIE_NAME below) instead of in the JSON body — browsers only
  // attach/accept cross-origin cookies on fetch/XHR when both sides opt in:
  // the server via this flag, the client via axios's withCredentials/
  // fetch's credentials:'include'. Safe to enable unconditionally since
  // origin() above already rejects anything not on the allowlist.
  credentials: true,
}));
app.use(cookieParser());

// (The refresh-token cookie helpers now live in routes/auth.js, the only
// place that sets/clears that cookie — cookieParser() above still has to
// stay here, though, so req.cookies exists before any router runs.)

// Express's default json() body limit is 100kb — far below what a base64
// avatar upload needs (the client allows up to a 2MB image, which becomes
// ~2.7MB of base64 text). Without this, any avatar over roughly 75KB raw
// silently failed with a 413 the entire time, regardless of the client's
// advertised 2MB cap. 3mb gives headroom above the 2.8MB check below.
app.use(express.json({ limit: '3mb' }));

// A short id every request carries from the moment it arrives — echoed back
// as a response header so a user/support report can be matched to a
// specific log line, and tagged onto the Sentry scope so a captured error
// can be cross-referenced with that same log line too. Sentry's Node SDK
// isolates this scope per-request automatically (its default http
// integration), so this tag never leaks across concurrent requests.
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  if (isSentryEnabled()) Sentry.getCurrentScope().setTag('request_id', req.id);
  next();
});

// Structured (JSON, one object per line) request logging — there was
// previously no visibility at all into what's actually being hit once this
// runs anywhere but a dev machine. Written after the response finishes, so
// the real status code and duration are known, and after authMiddleware
// (if the route has one) has already populated req.user, so the log can
// say *who* made the request, not just what the request was. Silenced in
// tests to keep test output readable.
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(JSON.stringify({
        reqId: req.id,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
        userId: req.user?.id,
        role: req.user?.role,
      }));
    });
    next();
  });
}

// Every write endpoint besides auth (checklist submission, course
// create/update, avatar upload, shop purchases, ...) previously had no
// throttle at all — a single script with a valid token could hammer any
// of them without limit. This is a coarse, generous backstop (not a
// precision tool), scoped to mutating methods only and skipped for the
// auth routes below, which already have their own tighter, purpose-built
// limiters.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Overridable for the same reasons as the auth limiters — see the note
  // above limitFromEnv in routes/auth.js.
  limit: Number(process.env.RATE_LIMIT_WRITE) > 0 ? Number(process.env.RATE_LIMIT_WRITE) : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
  skip: (req) => req.method === 'GET' || req.path.startsWith('/api/auth/'),
});
app.use(writeLimiter);

// Anything below this and the next few backup cycles are the last ones that
// will fit. Deliberately generous: an alert that fires with room to act on it
// is the whole point, and a false alarm here costs nothing.
// Free space below which the volume is worth worrying about — but never
// more headroom than a fifth of the volume, because a threshold larger
// than the whole disk can never be met.
//
// Railway provisions 433MB by default. A flat 512MB floor meant the health
// endpoint reported "degraded" from the moment the volume was created, at
// 6% used, and would have gone on reporting it until the disk was full.
// An alarm that is always sounding is one nobody looks at, which is worse
// than no alarm: this endpoint exists to make the one real disk problem
// visible before it happens.
const LOW_DISK_MB = 512;
const LOW_DISK_FRACTION = 0.2;

export function lowDiskThresholdMb(totalMb) {
  return Math.min(LOW_DISK_MB, Math.round(totalMb * LOW_DISK_FRACTION));
}

// statfsSync is Node 18.15+; wrapped because it is not implemented on every
// platform and a health check must never be the thing that breaks. Returning
// null just omits the field — the write probe above is still the real check.
function diskSpace() {
  try {
    if (db.name === ':memory:') return null;
    const st = fs.statfsSync(path.dirname(db.name));
    const freeMb = Math.round((st.bavail * st.bsize) / 1024 / 1024);
    const totalMb = Math.round((st.blocks * st.bsize) / 1024 / 1024);
    return { freeMb, totalMb, usedPct: totalMb ? Math.round(((totalMb - freeMb) / totalMb) * 100) : null };
  } catch {
    return null;
  }
}

// Health check for the hosting platform (Railway et al.) and any future
// uptime monitor. Deliberately unauthenticated and unthrottled — checks
// the DB is actually responsive, not just that the process is alive,
// since a locked/corrupted SQLite file is exactly the kind of failure a
// bare "process is up" check would miss.
app.get('/api/health', (req, res) => {
  try {
    // A read-only probe alone (just SELECT 1) can't catch a read-only
    // volume or full disk — reads keep working fine right up until a write
    // is attempted. This is exactly the failure mode that once let a broken
    // deploy report "healthy" while every real write in the app crashed —
    // see docker-entrypoint.sh's history. INSERT OR REPLACE into a
    // single-row scratch table actually exercises a write, cheaply and
    // without growing the DB.
    db.prepare('INSERT OR REPLACE INTO _health_check (id, checked_at) VALUES (1, CURRENT_TIMESTAMP)').run();

    // Free space on the volume holding the database. The write probe above
    // catches a disk that is *already* full; this is the part that can be
    // seen coming, because the DB and its 28 rotating backups share one
    // volume and nothing else reports on it. A monitor can alert on
    // disk.freeMb, and `degraded` makes a bare eyeball check enough.
    const disk = diskSpace();
    const low = disk && disk.freeMb < lowDiskThresholdMb(disk.totalMb);
    res.json({ status: low ? 'degraded' : 'ok', ...(disk ? { disk } : {}) });
  } catch (err) {
    logError(err);
    res.status(503).json({ status: 'error' });
  }
});

// Domain routers extracted out of this file — see PROGRESS.md for why and
// the extraction order. Mounted with no prefix since every route inside
// already carries its own full /api/... path.
app.use(knowledgeRouter);
app.use(suggestionsRouter);
app.use(newsRouter);
app.use(frogLinesRouter);
app.use(presenceRouter);
app.use(leadRouter);
app.use(profileRouter);
app.use(lecturesAdminRouter);
app.use(coursesRouter);
app.use(adminRouter);
app.use(authRouter);
app.use(testerRouter);

// Reports anything that reaches Express's own error-handling chain (multer
// errors, the CORS origin rejection, any route that threw instead of
// catching) to Sentry, then calls next(err) so the handler below still
// builds the actual response — unchanged either way. Most business-logic
// errors never reach this far (see logError, used in each route's own
// catch block instead), but this is the backstop for what does.
if (isSentryEnabled()) Sentry.setupExpressErrorHandler(app);

// Global error handler — catches multer errors and anything else that throws
app.use((err, req, res, next) => {
  console.error(err);
  // MulterError (e.g. LIMIT_FILE_SIZE on an oversized import) sets neither
  // .status nor .statusCode, so it used to fall through to the generic 500
  // below — technically fine (the message still reached the client) but
  // inconsistent with every other validation error in the app, which is 400.
  const isMulterError = err.name === 'MulterError';
  const status = err.status || err.statusCode || (isMulterError ? 400 : 500);
  res.status(status).json({ error: err.message || 'Server error' });
});

export { cleanupRefreshTokens };
export default app;

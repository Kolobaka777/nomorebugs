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
import { db } from '../db/schema.js';
import { bootstrap, cleanupRefreshTokens } from './bootstrap.js';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
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

// Startup work — schema, seeds, side channels, cleanups — lives in
// bootstrap.js. Awaited here so nothing serves a request against a database
// whose migrations have not finished.
await bootstrap();

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

// GET had no throttle at all. The comment above calls the write limiter a
// coarse backstop "scoped to mutating methods only", which was a decision
// made when reads were assumed cheap — they are not here.
// /api/avatars/gallery/:id/image serves image bytes out of the database and
// /api/custom-courses runs correlated subqueries per catalog row, both over
// a synchronous better-sqlite3 handle that occupies the event loop for the
// duration. Measured before this existed: 350 consecutive reads drew zero
// 429s.
// Generous on purpose — a person clicking around the app comes nowhere near
// it, and this is a backstop against a script, not a quota. /api/health is
// exempt: the platform polls it on a schedule and must never be throttled
// out of knowing whether the service is alive.
const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_READ) > 0 ? Number(process.env.RATE_LIMIT_READ) : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
  skip: (req) => req.method !== 'GET' || req.path === '/api/health',
});
app.use(readLimiter);

// Anything below this and the next few backup cycles are the last ones that
// will fit. Deliberately generous: an alert that fires with room to act on it
// is the whole point, and a false alarm here costs nothing.
// Free space below which the volume is worth worrying about — but never
// more headroom than a fifth of the volume, because a threshold larger
// than the whole disk can never be met.
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
// The write probe below is the point of this endpoint, and it is also a
// database write on an unauthenticated, deliberately unthrottled route:
// measured at ~1370 req/s in-process, every one of them taking SQLite's
// single writer. Real writes — a submitted test, a saved profile, a coin
// award — queue behind whatever else is holding it.
// So the probe runs on a timer rather than per request. A platform health
// check polls every 30 seconds and a monitor rarely faster; ten seconds is
// far below both, and a flood now gets the last answer instead of a fresh
// disk write. Cached only on success: once the probe fails, every caller
// re-runs it, because that is the moment the answer stops being stale news
// and starts being the thing being asked about.
const HEALTH_PROBE_INTERVAL_MS = 10 * 1000;
let lastHealthProbeAt = 0;

function probeWritable() {
  if (Date.now() - lastHealthProbeAt < HEALTH_PROBE_INTERVAL_MS) return;
  db.prepare('INSERT OR REPLACE INTO _health_check (id, checked_at) VALUES (1, CURRENT_TIMESTAMP)').run();
  lastHealthProbeAt = Date.now();
}

// Exported so a test can put the probe back on the next request rather than
// waiting out the interval in real time.
export function resetHealthProbeCache() {
  lastHealthProbeAt = 0;
}

app.get('/api/health', (req, res) => {
  try {
    // A read-only probe alone (just SELECT 1) can't catch a read-only
    // volume or full disk — reads keep working fine right up until a write
    // is attempted. This is exactly the failure mode that once let a broken
    // deploy report "healthy" while every real write in the app crashed —
    // see docker-entrypoint.sh's history. INSERT OR REPLACE into a
    // single-row scratch table actually exercises a write, cheaply and
    // without growing the DB.
    probeWritable();

    // Free space on the volume holding the database. The write probe above
    // catches a disk that is *already* full; this is the part that can be
    // seen coming, because the DB and its 28 rotating backups share one
    // volume and nothing else reports on it. A monitor can alert on
    // disk.freeMb, and `degraded` makes a bare eyeball check enough.
    const disk = diskSpace();
    const low = disk && disk.freeMb < lowDiskThresholdMb(disk.totalMb);
    res.json({ status: low ? 'degraded' : 'ok', ...(disk ? { disk } : {}) });
  } catch (err) {
    // Do not let a failed probe be remembered as a recent one — the next
    // caller has to actually try the disk again.
    lastHealthProbeAt = 0;
    logError(err);
    res.status(503).json({ status: 'error' });
  }
});

// Domain routers extracted out of this file. Mounted with no prefix since every route inside
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

  // A body express.json() could not parse answered with the parser's own
  // words — `{"error":"Unexpected end of JSON input"}`. Nothing secret in
  // it, but it is an internal detail of a dependency surfacing as this
  // API's contract, and it tells the caller nothing they can act on.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Тело запроса не является корректным JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Тело запроса слишком большое' });
  }

  // Everything with a deliberate status carries a message meant to be read
  // (the CORS rejection, multer's size limit, anything a route threw on
  // purpose). A bare 500 does not: whatever it says is an internal
  // accident, and the request id is the useful half — it is what ties a
  // support message to the log line and the Sentry event.
  if (status >= 500) {
    return res.status(status).json({ error: 'Server error', requestId: req.id });
  }
  res.status(status).json({ error: err.message || 'Server error' });
});

export { cleanupRefreshTokens };
export default app;

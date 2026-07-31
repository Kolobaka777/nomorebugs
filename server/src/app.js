import 'dotenv/config';
// Must come before express/helmet/etc. below — see the comment in
// sentry.js for why this ordering is load-bearing, not stylistic.
import { Sentry, isSentryEnabled, logError } from './sentry.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { db, initDb } from '../db/schema.js';
import bcryptjs from 'bcryptjs';
import { generateAccessToken, generateRefreshToken, hashToken, authMiddleware, requireRole } from './auth.js';
import { ROLES, DEFAULT_ROLE, isValidRole } from './roles.js';
import {
  initTelegramBot, isTelegramConfigured, createTelegramToken, buildDeepLink,
  pollTelegramToken, notifyUser,
} from './telegram.js';
import multer from 'multer';
import ExcelJS from 'exceljs';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { startBackupSchedule, runBackup } from './backup.js';

// A snapshot taken right before initDb() runs its migrations — if a
// migration ever goes wrong against real production data, this is the
// point to restore from. Only in production (dev/test DBs are disposable),
// and only best-effort: a backup failure must never block startup itself.
if (process.env.NODE_ENV === 'production') {
  try {
    const dest = await runBackup();
    if (dest) console.log(`Pre-migration safety backup written to ${dest}`);
  } catch (err) {
    console.error('Pre-migration backup failed (continuing startup anyway):', err.message);
  }
}

initDb();

// Long-polling connection to the Telegram Bot API — a no-op unless
// TELEGRAM_BOT_TOKEN is set, and never started under tests (no real
// network, and every test file importing app.js would otherwise spin up
// its own competing poller against the same bot token).
if (process.env.NODE_ENV !== 'test') {
  initTelegramBot();
}

// Periodic on-volume backups — a no-op for the ':memory:' DB tests use.
// See backup.js for what this does and doesn't protect against.
if (process.env.NODE_ENV !== 'test') {
  startBackupSchedule();
}

// A UNIQUE-constraint violation reaching the generic catch block in a route
// used to surface as a bare 500 "Server error" — technically correct but
// unhelpful, since the actual cause (e.g. "you already submitted this") is
// a normal, expected condition, not a server fault. Route handlers that
// know they're at risk of hitting a real UNIQUE constraint (not a bug)
// should catch that specific case and call this instead of falling through
// to a plain 500.
function isUniqueConstraintError(err) {
  return typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');
}

// SQLite's CURRENT_TIMESTAMP returns UTC time as "YYYY-MM-DD HH:MM:SS" with
// no timezone marker. Node parses that non-standard, space-separated string
// as LOCAL (server) time rather than UTC, which silently skews any Date
// arithmetic done directly on a raw DB timestamp on a non-UTC host — e.g.
// a team member's "days inactive" or a tester's own account-age stat.
// Mirrors client/src/utils/date.ts's parseServerDate — keep both in sync.
function parseDbDate(raw) {
  if (!raw) return new Date(NaN);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  return new Date(hasZone ? raw : `${raw.replace(' ', 'T')}Z`);
}

// A custom course can be edited/published/deleted by whoever authored it,
// or by an admin. Shared so the rule only has to change in one place.
function canManageCourse(course, user) {
  return course.created_by === user.id || user.role === 'admin';
}

// The real, permanent, cascading delete — only ever called from the trash
// purge route (POST-soft-delete cleanup). A crash mid-cascade would
// otherwise leave orphaned rows (quiz questions with no lesson, etc.), so
// it's wrapped in one transaction.
function hardDeleteCourse(courseId) {
  db.transaction(() => {
    const mods = db.prepare('SELECT id FROM custom_modules WHERE course_id = ?').all(courseId);
    for (const m of mods) {
      const lessons = db.prepare('SELECT id FROM custom_lessons WHERE module_id = ?').all(m.id);
      for (const l of lessons) {
        db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(l.id);
        db.prepare('DELETE FROM custom_lesson_progress WHERE lesson_id = ?').run(l.id);
      }
      db.prepare('DELETE FROM custom_lessons WHERE module_id = ?').run(m.id);
    }
    db.prepare('DELETE FROM custom_modules WHERE course_id = ?').run(courseId);
    db.prepare('DELETE FROM custom_course_views WHERE course_id = ?').run(courseId);
    db.prepare('DELETE FROM custom_courses WHERE id = ?').run(courseId);
  })();
}

// Auto-seed demo users if DB is empty — dev/test convenience only. Gated out
// of production so a wiped volume or fresh prod deploy never silently stands
// up accounts with published, guessable passwords (lead123/test123). A real
// production first-boot should create its own admin via ADMIN_EMAIL/
// ADMIN_PASSWORD env vars instead (see below).
(function seedUsersIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get();
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
}));
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
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
  skip: (req) => req.method === 'GET' || req.path.startsWith('/api/auth/'),
});
app.use(writeLimiter);

// Health check for the hosting platform (Railway et al.) and any future
// uptime monitor. Deliberately unauthenticated and unthrottled — checks
// the DB is actually responsive, not just that the process is alive,
// since a locked/corrupted SQLite file is exactly the kind of failure a
// bare "process is up" check would miss.
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Health check DB probe failed:', err);
    res.status(503).json({ status: 'error' });
  }
});

// ============== AUTH ENDPOINTS ==============

// Throttles login attempts per IP to slow down credential brute-forcing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте снова через несколько минут.' },
});

// Refresh fires automatically (every ~15min access-token expiry, across
// every open tab/device), so it needs a much higher ceiling than login —
// this is a DoS/abuse guard, not a brute-force guard (the token itself is
// an unguessable random value, not a low-entropy password).
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
});

// Logout is user-initiated and rare — same budget as login is generous enough.
const logoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
});

// Same budget as login — registration abuse (mass fake accounts) is the
// concern here, not brute-forcing a specific credential.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток регистрации. Попробуйте снова через несколько минут.' },
});

// Same budget as login/register — this is what actually creates the token
// row, so the abuse concern (token-table exhaustion) is the same shape.
const telegramStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте снова через несколько минут.' },
});

// The client polls this every ~2s for up to the token's 5-minute TTL —
// that's ~150 requests for one legitimate login, so this needs a much
// higher ceiling than the other auth limiters. Still a real cap: it's an
// unauthenticated endpoint, and the answer for a given token is cheap to
// guess-and-check without one (guarding brute-forcing a token isn't the
// point, since a token is 24 random bytes; this is purely an abuse/DoS
// backstop).
const telegramPollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуйте снова через несколько минут.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Precomputed (cost 10, matching real user hashes) — used only so a login
// attempt against a nonexistent email still pays a real bcrypt comparison
// instead of short-circuiting. See the login handler below.
const DUMMY_PASSWORD_HASH = '$2a$10$9N67OtDYKcJCaw/4ZoOwdOkJuIEt.J737uamSbL/lkuQNTCXADtse';

function initialsFromName(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map(w => w[0]).join('');
  return (initials || '?').toUpperCase();
}

// Self-registration. Every account starts at DEFAULT_ROLE ('tester') — an
// admin promotes accounts to 'lead' or any future role via the admin
// endpoints below. Deliberately returns the same shape as /login (token +
// refreshToken + user) so the client can treat "just registered" and "just
// logged in" identically.
app.post('/api/auth/register', registerLimiter, (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name?.trim()) {
      return res.status(400).json({ error: 'Email, пароль и имя обязательны' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 8 символов' });
    }
    if (name.trim().length > 60) {
      return res.status(400).json({ error: 'Имя слишком длинное (макс 60)' });
    }

    const passwordHash = bcryptjs.hashSync(password, 10);
    const avatarInitials = initialsFromName(name);

    let userId;
    try {
      userId = db.prepare(
        'INSERT INTO users (email, password, name, role, avatar_initials) VALUES (?, ?, ?, ?, ?)'
      ).run(email.trim().toLowerCase(), passwordHash, name.trim(), DEFAULT_ROLE, avatarInitials).lastInsertRowid;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ error: 'Этот email уже зарегистрирован' });
      }
      throw err;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const token = generateAccessToken(user);
    const refresh = generateRefreshToken();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, refresh.hash, refresh.expiresAt.toISOString());

    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(user.id, 'register');

    // Fire-and-forget — Telegram if linked (it never is at this point for a
    // fresh email/password signup, so this realistically goes to the SMTP
    // fallback if configured, or is silently skipped otherwise), never
    // blocks the response on notification delivery.
    notifyUser(user, 'Регистрация в baga-net', `Аккаунт "${user.name}" зарегистрирован. Добро пожаловать в нору!`);

    res.status(201).json({
      token,
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials },
      needsBaselineSurvey: user.role === 'tester',
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Always pay the bcrypt cost, even when the email doesn't exist —
    // short-circuiting on `!user` would return in microseconds for a
    // nonexistent email but the full bcrypt-10 cost for a wrong password,
    // and that timing gap is itself an email-enumeration side channel
    // despite the identical response body below.
    const passwordMatches = bcryptjs.compareSync(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.archived_at) {
      return res.status(403).json({ error: 'Аккаунт деактивирован. Обратитесь к лиду или администратору.' });
    }

    const token = generateAccessToken(user);
    const refresh = generateRefreshToken();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, refresh.hash, refresh.expiresAt.toISOString());

    let needsBaselineSurvey = false;
    if (user.role === 'tester') {
      const baseline = db.prepare('SELECT id FROM baseline_survey WHERE user_id = ?').get(user.id);
      needsBaselineSurvey = !baseline;
    }

    // Log login activity
    db.prepare(`INSERT INTO activity_log (user_id, action) VALUES (?, ?)`).run(user.id, 'login');

    // Security alert — Telegram only (a fallback email per login would be
    // spam, not a security feature); silently skipped for accounts with no
    // Telegram linked, which is the common case for email/password users.
    if (user.telegram_id) {
      notifyUser(user, 'Новый вход', `Выполнен вход в аккаунт baga-net (${user.email}). Это был не ты? Смени пароль и сообщи лиду.`);
    }

    res.json({
      token,
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials },
      needsBaselineSurvey,
      mustChangePassword: !!user.must_change_password,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Exchanges a valid, non-revoked refresh token for a new short-lived access token.
app.post('/api/auth/refresh', refreshLimiter, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    const hash = hashToken(refreshToken);
    const row = db.prepare(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL'
    ).get(hash);

    if (!row || new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user) return res.status(401).json({ error: 'Refresh token invalid or expired' });

    const token = generateAccessToken(user);
    res.json({ token });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Revokes a refresh token so it can no longer be exchanged for access tokens
// (the still-outstanding access token, if any, remains valid for at most its
// own short TTL — there is no server-side access-token blacklist by design).
app.post('/api/auth/logout', logoutLimiter, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?')
        .run(hashToken(refreshToken));
    }
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== PASSWORD CHANGE / RESET ==============

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте снова через несколько минут.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте снова через несколько минут.' },
});

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Пароль должен быть не короче 8 символов';
  }
  return null;
}

// Revokes every outstanding refresh token for a user — called on any
// password change so a leaked/compromised session doesn't survive it.
function revokeAllRefreshTokens(userId) {
  db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL').run(userId);
}

function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars, URL-safe
}

// Self-service — the account is already logged in and knows its current password.
app.put('/api/me/password', authMiddleware, passwordChangeLimiter, (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcryptjs.compareSync(current_password || '', user.password)) {
      return res.status(401).json({ error: 'Текущий пароль неверен' });
    }
    const validationError = validateNewPassword(new_password);
    if (validationError) return res.status(400).json({ error: validationError });

    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
      .run(bcryptjs.hashSync(new_password, 10), user.id);
    revokeAllRefreshTokens(user.id);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(user.id, 'password_changed');

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead/admin — resets someone else's password to a random temporary one,
// delivered via whichever notification channel they have (Telegram first,
// email fallback — see notifyUser), and forces a change on next login. A
// lead can only reset testers (mirrors the scoped-permission-grant rule);
// admin can reset anyone. There is deliberately no "view current password"
// endpoint — passwords are one-way hashed and unrecoverable by design, this
// is the correct replacement for that.
app.post('/api/admin/users/:id/reset-password', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может сбрасывать пароль только тестировщикам' });
    }

    const tempPassword = generateTempPassword();
    db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?')
      .run(bcryptjs.hashSync(tempPassword, 10), target.id);
    revokeAllRefreshTokens(target.id);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
      .run(req.user.id, `password_reset:target=${target.id}`);

    const delivered = notifyUser(
      target, 'Сброс пароля',
      `Твой пароль в baga-net сброшен администратором. Временный пароль: ${tempPassword}\nПри следующем входе нужно будет задать новый.`
    );

    res.json({ ok: true, delivered, tempPassword: delivered === 'none' ? tempPassword : undefined });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Public — no session yet. Always returns the same generic response
// regardless of whether the email exists, so this can't be used to check
// which addresses are registered.
app.post('/api/auth/forgot-password', forgotPasswordLimiter, (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email обязателен' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
    if (user && !user.email.endsWith('@telegram.local')) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
      db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
        .run(user.id, hashToken(token), expiresAt);

      const appUrl = (allowedOrigins[0] || 'http://localhost:5173').replace(/\/$/, '');
      const link = `${appUrl}/reset-password?token=${token}`;
      notifyUser(user, 'Восстановление пароля', `Ссылка для сброса пароля в baga-net (действует 30 минут): ${link}\nЕсли это был не ты — просто проигнорируй это сообщение.`);
    }

    res.json({ ok: true, message: 'Если такой email зарегистрирован, на него (или в Telegram) отправлена ссылка для сброса пароля.' });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/reset-password', forgotPasswordLimiter, (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token) return res.status(400).json({ error: 'Токен обязателен' });

    const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(hashToken(token));
    if (!row || new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Ссылка недействительна или устарела' });
    }
    const validationError = validateNewPassword(new_password);
    if (validationError) return res.status(400).json({ error: validationError });

    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
      .run(bcryptjs.hashSync(new_password, 10), row.user_id);
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(row.user_id);
    revokeAllRefreshTokens(row.user_id);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(row.user_id, 'password_reset_self_service');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    notifyUser(user, 'Пароль изменён', 'Пароль твоего аккаунта baga-net был только что изменён через восстановление доступа. Это был не ты? Срочно сообщи лиду.');

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TELEGRAM AUTH ==============
// Login/registration via Telegram, plus linking an existing account for
// notifications. All three "start" endpoints share the same shape: create
// a one-time token, hand back a t.me deep link, let the client poll for
// the result once the person taps it in Telegram. See telegram.js for the
// actual /start handling and the token lifecycle.

app.post('/api/auth/telegram/start', telegramStartLimiter, (req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Вход через Telegram временно недоступен' });
  }
  const { token, expiresAt } = createTelegramToken();
  const deepLink = buildDeepLink(token);
  if (!deepLink) {
    // Bot token is set but getMe() hasn't resolved yet (very brief window
    // right after server start) — ask the client to retry rather than
    // handing back a broken link.
    return res.status(503).json({ error: 'Telegram-бот ещё запускается, попробуйте через пару секунд' });
  }
  res.json({ token, deepLink, expiresAt });
});

app.get('/api/auth/telegram/poll/:token', telegramPollLimiter, (req, res) => {
  const result = pollTelegramToken(req.params.token);
  res.json(result);
});

// Authenticated: lets an existing (e.g. email/password) account attach
// Telegram after the fact, purely so it can start receiving notifications
// and use Telegram to log in going forward — no new session is issued.
app.post('/api/auth/telegram/link/start', authMiddleware, telegramStartLimiter, (req, res) => {
  if (!isTelegramConfigured()) {
    return res.status(503).json({ error: 'Telegram временно недоступен' });
  }
  const { token, expiresAt } = createTelegramToken(req.user.id);
  const deepLink = buildDeepLink(token);
  if (!deepLink) {
    return res.status(503).json({ error: 'Telegram-бот ещё запускается, попробуйте через пару секунд' });
  }
  res.json({ token, deepLink, expiresAt });
});

app.get('/api/auth/telegram/status', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT telegram_id, telegram_username FROM users WHERE id = ?').get(req.user.id);
  res.json({ linked: !!user.telegram_id, telegramUsername: user.telegram_username || null });
});

app.post('/api/auth/telegram/unlink', authMiddleware, (req, res) => {
  db.prepare('UPDATE users SET telegram_id = NULL, telegram_username = NULL WHERE id = ?').run(req.user.id);
  res.json({ success: true });
});

// ============== TESTER CABINET ==============

app.get('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT id, name, email, avatar_initials FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tester/metrics', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const completedCount = db.prepare(`
      SELECT COUNT(*) as count FROM test_results WHERE user_id = ? AND score >= 60
    `).get(userId);

    const avgScore = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    const baseline = db.prepare(`
      SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0 as avg
      FROM baseline_survey WHERE user_id = ?
    `).get(userId);

    const currentSkills = db.prepare(`
      SELECT AVG(score) as avg FROM test_results WHERE user_id = ?
    `).get(userId);

    // Both sides normalized to a 0-100 scale: baseline is a 1-5 self-rating (x20),
    // current is the average test score (already 0-100).
    const skillGrowth = (currentSkills?.avg || 0) - (baseline?.avg || 0) * 20;
    const weeksRemaining = 10 - (completedCount?.count || 0);

    res.json({
      lecturesCompleted: completedCount?.count || 0,
      averageScore: Math.round(avgScore?.avg || 0),
      skillGrowth: skillGrowth.toFixed(1),
      weeksRemaining,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/tester/lectures', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const lectures = db.prepare(`
      SELECT l.*,
        (SELECT score FROM test_results WHERE user_id = ? AND lecture_id = l.id) as score,
        (SELECT COUNT(*) FROM test_results WHERE user_id = ? AND lecture_id = l.id) as passed
      FROM lectures l
      ORDER BY l.order_num
    `).all(userId, userId);

    const lecturesWithStatus = lectures.map((lecture, idx) => {
      // `passed` here is actually an attempt count (see query above), not a
      // pass/fail flag — a real pass additionally requires score >= 60.
      const passedWithScore = lecture.passed && lecture.score >= 60;

      let status;
      if (passedWithScore) {
        status = 'passed';
      } else if (idx === 0) {
        // The first lecture is always available, including for a retry after a failed attempt.
        status = 'active';
      } else {
        const prevLecture = lectures[idx - 1];
        status = (prevLecture.passed && prevLecture.score >= 60) ? 'active' : 'locked';
      }

      return { ...lecture, status };
    });

    res.json(lecturesWithStatus);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER HISTORY ==============

app.get('/api/tester/history', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const history = db.prepare(`
      SELECT tr.id, tr.score, tr.completed_at, l.title as lecture_title, l.skill_area
      FROM test_results tr
      JOIN lectures l ON tr.lecture_id = l.id
      WHERE tr.user_id = ?
      ORDER BY tr.completed_at DESC
    `).all(userId);

    res.json(history);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TESTER BEFORE/AFTER ==============

app.get('/api/tester/before-after', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const baseline = db.prepare('SELECT * FROM baseline_survey WHERE user_id = ?').get(userId);
    const final = db.prepare('SELECT * FROM final_survey WHERE user_id = ?').get(userId);

    const skills = [
      { key: 'html_structure', label: 'HTML структура' },
      { key: 'css_reading', label: 'Чтение CSS' },
      { key: 'devtools', label: 'DevTools' },
      { key: 'console_errors', label: 'Ошибки консоли' },
      { key: 'bug_report_quality', label: 'Баг-репорты' },
    ];

    const result = skills.map(s => {
      const before = baseline?.[s.key] || 0;
      const after = final?.[s.key] || before;
      return {
        skill: s.label,
        before,
        after,
        delta: after - before,
      };
    });

    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== GLOBAL STATS ==============

app.get('/api/stats', (req, res) => {
  try {
    const courses = db.prepare('SELECT COUNT(*) as count FROM lectures').get();
    const testers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'tester'").get();
    const bugsCaught = db.prepare('SELECT COUNT(*) as count FROM test_results WHERE score >= 60').get();

    res.json({
      courses: courses?.count || 0,
      testers: testers?.count || 0,
      bugsCaught: bugsCaught?.count || 0,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== QUIZ ENDPOINTS ==============

app.get('/api/lectures/:id/questions', authMiddleware, (req, res) => {
  try {
    const questions = db.prepare(`
      SELECT id, lecture_id, question_text, option_a, option_b, option_c, option_d, order_num
      FROM questions
      WHERE lecture_id = ?
      ORDER BY order_num
    `).all(req.params.id);

    res.json(questions);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/lectures/:id/submit-test', authMiddleware, (req, res) => {
  try {
    const { answers, meta } = req.body;
    const lectureId = req.params.id;
    const userId = req.user.id;

    // Mandatory sequential prerequisite, server-enforced. Previously this
    // was only a display-layer computation (in GET /api/tester/lectures) —
    // the frontend hid the button for a "locked" lecture, but nothing
    // stopped a direct API call from submitting one anyway.
    const lecture = db.prepare('SELECT order_num FROM lectures WHERE id = ?').get(lectureId);
    if (!lecture) return res.status(404).json({ error: 'Лекция не найдена' });
    const prevLecture = db.prepare('SELECT id FROM lectures WHERE order_num < ? ORDER BY order_num DESC LIMIT 1').get(lecture.order_num);
    if (prevLecture) {
      const prevResult = db.prepare('SELECT score FROM test_results WHERE user_id = ? AND lecture_id = ?').get(userId, prevLecture.id);
      if (!prevResult || prevResult.score < 60) {
        return res.status(403).json({ error: 'Сначала нужно пройти предыдущую лекцию' });
      }
    }

    const questions = db.prepare(`
      SELECT id, correct_answer, question_text, option_a, option_b, option_c, option_d
      FROM questions WHERE lecture_id = ? ORDER BY order_num
    `).all(lectureId);

    let score = 0;
    const answersMap = {};

    for (const question of questions) {
      const userAnswer = answers[question.id];
      answersMap[question.id] = userAnswer;
      if (userAnswer === question.correct_answer) {
        score += (100 / questions.length);
      }
    }

    score = Math.round(score);

    // Review signals only — never blocks or penalizes scoring. The
    // threshold is per-question, derived from how much there actually is to
    // read (question + all 4 options), not a flat number — a flat cutoff
    // is trivial to game (just wait exactly 2.1s per question); tying it to
    // word count means the minimum plausible time varies question to
    // question in a way a cheater filling in memorized answers has no easy
    // way to predict or spoof, while a genuinely fast, competent tester
    // reading normally still clears it.
    function minPlausibleSeconds(q) {
      const text = [q.question_text, q.option_a, q.option_b, q.option_c, q.option_d].join(' ');
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      return Math.max(3, Math.ceil(wordCount / 3)); // ~3 words/sec fast-but-real reading pace
    }
    const questionTimes = (meta?.questionTimes && typeof meta.questionTimes === 'object') ? meta.questionTimes : {};
    const tabSwitches = Number.isInteger(meta?.tabSwitches) ? meta.tabSwitches : 0;
    const fastAnswerCount = questions.filter(q => (questionTimes[q.id] ?? 999) < minPlausibleSeconds(q)).length;
    const resultMeta = JSON.stringify({ questionTimes, tabSwitches, fastAnswerCount });

    // Result, activity log, card award, and coin award must all land together
    // or not at all — a crash mid-sequence used to be able to record a score
    // with no card/coins granted for it.
    const coinsEarned = score >= 90 ? 25 : score >= 75 ? 18 : score >= 60 ? 10 : 3;
    let cardDrop = null;
    db.transaction(() => {
      db.prepare(`
        INSERT OR REPLACE INTO test_results (user_id, lecture_id, score, answers, meta)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, lectureId, score, JSON.stringify(answersMap), resultMeta);

      db.prepare(`
        INSERT INTO activity_log (user_id, action, lecture_id)
        VALUES (?, ?, ?)
      `).run(userId, score >= 60 ? 'passed_lecture' : 'failed_lecture', lectureId);

      // Award trading card if passed
      if (score >= 60) {
        const lec = db.prepare('SELECT skill_area FROM lectures WHERE id = ?').get(lectureId);
        if (lec) {
          const rarity = score >= 90 ? 'epic' : score >= 75 ? 'rare' : 'common';
          const inserted = db.prepare(
            'INSERT OR IGNORE INTO user_cards (user_id, lecture_id, skill_area, rarity) VALUES (?,?,?,?)'
          ).run(userId, lectureId, lec.skill_area, rarity);
          if (inserted.changes > 0) {
            cardDrop = { skill_area: lec.skill_area, rarity };
          }
          // Check if block is now craftable
          const collected = db.prepare('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ? AND skill_area = ?').get(userId, lec.skill_area)?.c || 0;
          const total     = db.prepare('SELECT COUNT(*) as c FROM lectures WHERE skill_area = ?').get(lec.skill_area)?.c || 0;
          const alreadyBadged = db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, lec.skill_area);
          if (cardDrop) cardDrop.canCraft = (collected >= total) && !alreadyBadged;
        }
      }

      // Award bug_coins
      db.prepare(`
        INSERT INTO user_profiles (user_id, bug_coins)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET bug_coins = COALESCE(bug_coins, 0) + excluded.bug_coins
      `).run(userId, coinsEarned);

      // Hidden quality+speed signal for a lead's internal-ratings view (see
      // /api/lead/internal-ratings) — score AND speed both have to be
      // genuinely good, and speed is disqualified entirely by even one
      // suspiciously-fast answer or more than one tab-switch, so this can't
      // be farmed by rushing through with memorized answers.
      if (score >= 90 && fastAnswerCount === 0 && tabSwitches <= 1) {
        db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
          .run(userId, 5, `Отличный результат по лекции (${score}%), без признаков спешки`, 'auto_quiz_excellence');
      }
    })();

    res.json({ score, passed: score >= 60, cardDrop, coinsEarned });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SHOP ──────────────────────────────────────────────────────────────────────
const SHOP_CATALOG = {
  'frame_gold':    { cost: 200, label: 'Золотая рамка' },
  'frame_rainbow': { cost: 350, label: 'Рамка-радуга' },
  'frame_glitch':  { cost: 300, label: 'Глитч-рамка' },
  'bg_hive':       { cost: 150, label: 'Фон «Улей»' },
  'bg_amber':      { cost: 250, label: 'Фон «Янтарь»' },
};

app.post('/api/tester/shop/buy', authMiddleware, (req, res) => {
  try {
    const { item_id } = req.body;
    const item = SHOP_CATALOG[item_id];
    if (!item) return res.status(400).json({ error: 'Неизвестный товар' });

    const userId = req.user.id;
    const row = db.prepare('SELECT bug_coins, purchased_items FROM user_profiles WHERE user_id = ?').get(userId) || {};
    const coins     = row.bug_coins || 0;
    const purchased = JSON.parse(row.purchased_items || '[]');

    if (purchased.includes(item_id)) return res.status(400).json({ error: 'Уже куплено' });
    if (coins < item.cost) return res.status(400).json({ error: `Недостаточно монет (нужно ${item.cost})` });

    const newCoins     = coins - item.cost;
    const newPurchased = JSON.stringify([...purchased, item_id]);

    db.prepare(`
      INSERT INTO user_profiles (user_id, bug_coins, purchased_items)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET bug_coins = ?, purchased_items = ?
    `).run(userId, newCoins, newPurchased, newCoins, newPurchased);

    res.json({ success: true, newCoins, item_id });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lectures/:id/question/:qid/explanation', authMiddleware, (req, res) => {
  try {
    const question = db.prepare(`
      SELECT question_text, option_a, option_b, option_c, option_d, correct_answer, explanation
      FROM questions
      WHERE id = ?
    `).get(req.params.qid);

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const options = {
      a: question.option_a,
      b: question.option_b,
      c: question.option_c,
      d: question.option_d,
    };

    res.json({
      question: question.question_text,
      correctAnswer: question.correct_answer,
      correctOption: options[question.correct_answer],
      explanation: question.explanation,
      allOptions: options,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== BASELINE/FINAL SURVEY ==============

app.post('/api/tester/baseline-survey', authMiddleware, (req, res) => {
  try {
    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT INTO baseline_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    db.prepare(`INSERT INTO activity_log (user_id, action) VALUES (?, ?)`).run(userId, 'completed_baseline');

    res.json({ success: true });
  } catch (err) {
    // baseline_survey.user_id is UNIQUE by design (it's a one-time "before"
    // snapshot compared against the final survey later) — a second
    // submission hitting that constraint is an expected condition, not a
    // server fault.
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Вы уже проходили этот опрос' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tester/final-survey', authMiddleware, (req, res) => {
  try {
    const { html_structure, css_reading, devtools, console_errors, bug_report_quality } = req.body;
    const userId = req.user.id;

    db.prepare(`
      INSERT OR REPLACE INTO final_survey (user_id, html_structure, css_reading, devtools, console_errors, bug_report_quality)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, html_structure, css_reading, devtools, console_errors, bug_report_quality);

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== LEAD DASHBOARD ==============

// A lead-accessible view of archived testers — /api/admin/users (which
// also lists archived accounts) is admin-only, and a lead needs to see who
// they archived in order to restore them without going through admin.
app.get('/api/lead/archived-testers', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT id, name, avatar_initials, archived_at FROM users WHERE role = 'tester' AND archived_at IS NOT NULL ORDER BY archived_at DESC"
    ).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/team', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    // Everything (including the baseline average, folded in as one more
    // correlated subquery) comes from a single query now — this used to
    // additionally run 2 queries per tester in a follow-up loop, which
    // meant a team's page load scaled with team size instead of being
    // constant. avgScore was already being computed here for every member;
    // the old loop's "current" query was duplicating that exact value.
    const teamData = db.prepare(`
      SELECT
        u.id, u.name, u.avatar_initials,
        (SELECT COUNT(*) FROM test_results WHERE user_id = u.id AND score >= 60) as lecturesCompleted,
        (SELECT AVG(score) FROM test_results WHERE user_id = u.id) as avgScore,
        (SELECT MAX(created_at) FROM activity_log WHERE user_id = u.id) as lastActive,
        (SELECT (html_structure + css_reading + devtools + console_errors + bug_report_quality) / 5.0
         FROM baseline_survey WHERE user_id = u.id) as baselineAvg
      FROM users u
      WHERE u.role = 'tester' AND u.archived_at IS NULL
      ORDER BY u.name
    `).all();

    const now = Date.now();

    // Aggregated review signals (see submit-test's meta comment) — done in
    // JS rather than SQLite JSON functions since `meta` is a free-form
    // JSON-text column with no guarantee the JSON1 extension is compiled
    // into every better-sqlite3 build this runs on.
    const metaRows = db.prepare(
      `SELECT user_id, meta FROM test_results WHERE user_id IN (${teamData.map(() => '?').join(',') || 'NULL'})`
    ).all(...teamData.map(m => m.id));
    const signalsByUser = {};
    for (const row of metaRows) {
      let parsed;
      try { parsed = JSON.parse(row.meta || '{}'); } catch { parsed = {}; }
      const s = signalsByUser[row.user_id] || { fastAnswers: 0, tabSwitches: 0 };
      s.fastAnswers += parsed.fastAnswerCount || 0;
      s.tabSwitches += parsed.tabSwitches || 0;
      signalsByUser[row.user_id] = s;
    }

    const team = teamData.map(({ baselineAvg, ...member }) => {
      const lastActiveMs = member.lastActive ? parseDbDate(member.lastActive).getTime() : 0;
      const daysInactive = member.lastActive
        ? Math.floor((now - lastActiveMs) / (1000 * 60 * 60 * 24))
        : 999;

      // Both sides normalized to a 0-100 scale: baseline is a 1-5 self-rating (x20),
      // current is the average test score (already 0-100).
      const skillGrowth = Math.round((member.avgScore || 0) - (baselineAvg || 0) * 20);

      return {
        ...member,
        lecturesCompleted: member.lecturesCompleted || 0,
        avgScore: Math.round(member.avgScore || 0),
        skillGrowth,
        daysInactive,
        // Signals "might appreciate a check-in", not a judgment — kept as a
        // neutral flag so the UI layer can decide how (or whether) to surface it.
        needsCheckIn: daysInactive >= 7,
        fastAnswers: signalsByUser[member.id]?.fastAnswers || 0,
        tabSwitches: signalsByUser[member.id]?.tabSwitches || 0,
      };
    });

    res.json(team);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/before-after', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const skills = ['html_structure', 'css_reading', 'devtools', 'console_errors', 'bug_report_quality'];
    const skillLabels = ['HTML Structure', 'CSS Reading', 'DevTools', 'Console Errors', 'Bug Report Quality'];

    const chartData = [];

    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const label = skillLabels[i];
      const before = db.prepare(`SELECT AVG(${skill}) as avg FROM baseline_survey`).get();
      const after  = db.prepare(`SELECT AVG(${skill}) as avg FROM final_survey`).get();

      chartData.push({
        skill: label,
        before: Math.round((before?.avg || 0) * 10) / 10,
        after:  Math.round((after?.avg || 0) * 10) / 10,
        delta:  Math.round(((after?.avg || 0) - (before?.avg || 0)) * 10) / 10,
      });
    }

    res.json(chartData);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-lecture pass rate / avg score, so a lead can see which lectures are
// too hard (or too easy) instead of only per-tester aggregates. Built from
// test_results, which only keeps each tester's current attempt per lecture
// (INSERT OR REPLACE) — so this reflects current standing, not full attempt
// history, and "attempts" below really means "testers who have a result".
app.get('/api/lead/lecture-stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        l.id, l.title, l.skill_area, l.order_num,
        COUNT(tr.id) as attempts,
        AVG(tr.score) as avg_score,
        SUM(CASE WHEN tr.score >= 60 THEN 1 ELSE 0 END) as passed_count
      FROM lectures l
      LEFT JOIN test_results tr ON tr.lecture_id = l.id
      GROUP BY l.id
      ORDER BY l.order_num
    `).all();

    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      skill_area: r.skill_area,
      attempts: r.attempts,
      avgScore: r.attempts > 0 ? Math.round(r.avg_score * 10) / 10 : null,
      passRate: r.attempts > 0 ? Math.round((r.passed_count / r.attempts) * 100) : null,
    })));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/activity', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const userId = req.query.user_id ? parseInt(req.query.user_id, 10) : null;
    // Small, fixed feed (Home page's "recent activity" widget) vs the full,
    // pageable admin log — same query, different LIMIT/offset so one route
    // serves both without duplicating the join.
    const PAGE_SIZE = req.query.offset !== undefined || req.query.user_id ? 50 : 20;

    const where = userId ? 'WHERE a.user_id = ?' : '';
    const params = userId ? [userId] : [];

    const rows = db.prepare(`
      SELECT
        a.id, a.action, a.created_at,
        u.id as user_id, u.name,
        l.title as lecture_title
      FROM activity_log a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN lectures l ON a.lecture_id = l.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({ rows: rows.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== PROFILE CUSTOMIZATION ==============

// Badge unlock mappings (what each crafted badge awards)
const BADGE_UNLOCKS = {
  'HTML structure':      { frame: 'code',        bg: 'forest',  spec: 'HTML-жук' },
  'CSS reading':         { frame: 'rainbow',      bg: 'console', spec: 'CSS-жук' },
  'DevTools':            { frame: 'glitch',       bg: 'console', spec: 'DevTools-жук' },
  'Console errors':      { frame: 'code',         bg: 'console', spec: 'Консольный жук' },
  'Bug report quality':  { frame: 'crimescene',   bg: 'hive',    spec: 'Жук-репортёр' },
};

app.get('/api/tester/profile-full', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const user = db.prepare('SELECT id, email, name, avatar_initials, created_at FROM users WHERE id = ?').get(userId);
    const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId) || {};

    // RPG stats
    const totalTests    = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ?').get(userId)?.c || 0;
    const avgScore      = db.prepare('SELECT AVG(score) as a FROM test_results WHERE user_id = ?').get(userId)?.a || 0;
    const highScore     = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 80').get(userId)?.c || 0;
    const passedCount   = db.prepare('SELECT COUNT(*) as c FROM test_results WHERE user_id = ? AND score >= 60').get(userId)?.c || 0;

    const joined      = parseDbDate(user.created_at);
    const weeksActive = Math.max(1, Math.round((Date.now() - joined.getTime()) / (1000 * 60 * 60 * 24 * 7)));

    const stats = {
      int:     Math.min(10, Math.round(avgScore / 10)),
      per:     Math.min(10, Math.round((highScore / Math.max(1, totalTests)) * 10)),
      spd:     Math.min(10, Math.round((passedCount / weeksActive) * 1.5)),
      def:     Math.min(10, Math.round((passedCount / Math.max(1, totalTests)) * 10)),
      bug_pwr: Math.min(20, totalTests * 2),
    };

    // Streak
    const days = db.prepare(
      'SELECT DATE(created_at) as day FROM activity_log WHERE user_id = ? GROUP BY day ORDER BY day DESC'
    ).all(userId);
    let streak = 0;
    let expected = new Date().toISOString().split('T')[0];
    for (const { day } of days) {
      if (day === expected) {
        streak++;
        const d = new Date(expected); d.setDate(d.getDate() - 1);
        expected = d.toISOString().split('T')[0];
      } else break;
    }

    // Cards & badges
    const cards  = db.prepare('SELECT * FROM user_cards WHERE user_id = ? ORDER BY earned_at DESC').all(userId);
    const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

    // Craftable: all cards for a skill_area but badge not yet crafted
    const craftable = db.prepare(`
      SELECT uc.skill_area, COUNT(*) as card_count,
             (SELECT COUNT(*) FROM lectures WHERE skill_area = uc.skill_area) as total
      FROM user_cards uc WHERE uc.user_id = ?
      GROUP BY uc.skill_area
    `).all(userId)
      .filter(r => r.card_count >= r.total && !badges.find(b => b.badge_id === r.skill_area))
      .map(r => r.skill_area);

    // Favorite lecture detail
    let favLecture = null;
    if (profile.favorite_lecture_id) {
      favLecture = db.prepare(`
        SELECT l.id, l.title, l.skill_area, tr.score, tr.completed_at
        FROM lectures l LEFT JOIN test_results tr ON tr.lecture_id = l.id AND tr.user_id = ?
        WHERE l.id = ?
      `).get(userId, profile.favorite_lecture_id);
    }

    res.json({
      ...user,
      nickname:           profile.nickname    || user.name,
      status_quote:       profile.status_quote || '',
      specialization:     profile.specialization || '',
      info_box:           profile.info_box     || '',
      snail_joke:         profile.snail_joke   || '',
      avatar_id:          profile.avatar_id    || 'bug1',
      avatar_frame:       profile.avatar_frame || 'default',
      profile_bg:         profile.profile_bg   || 'default',
      showcase_badges:    JSON.parse(profile.showcase_badges || '[]'),
      favorite_lecture_id: profile.favorite_lecture_id || null,
      is_public:          profile.is_public !== undefined ? !!profile.is_public : true,
      custom_avatar:      profile.custom_avatar || null,
      bug_coins:          profile.bug_coins    || 0,
      purchased_items:    JSON.parse(profile.purchased_items || '[]'),
      stats, streak, cards, badges, craftable, favLecture,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/tester/profile', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const {
      nickname, status_quote, specialization, info_box, snail_joke,
      avatar_id, avatar_frame, profile_bg, showcase_badges,
      favorite_lecture_id, is_public, custom_avatar,
    } = req.body;

    if (nickname && nickname.length > 40)   return res.status(400).json({ error: 'Ник слишком длинный (макс 40)' });
    if (status_quote && status_quote.length > 60) return res.status(400).json({ error: 'Цитата слишком длинная (макс 60)' });
    if (info_box && info_box.length > 200)  return res.status(400).json({ error: 'Инфобокс слишком длинный (макс 200)' });
    // The client already enforces a 2MB cap before upload, but that's
    // trivially bypassable via a direct API call — base64 inflates the
    // original bytes by ~4/3, so allow a bit of headroom above the raw
    // 2MB target instead of the client's exact threshold. Avatars are
    // stored as base64 directly in the DB (a known, accepted trade-off
    // until they move to real file storage), so this is the only thing
    // standing between an unbounded string and the users table bloating.
    const MAX_AVATAR_BASE64_CHARS = 2.8 * 1024 * 1024;
    if (custom_avatar && custom_avatar.length > MAX_AVATAR_BASE64_CHARS) {
      return res.status(400).json({ error: 'Аватар слишком большой (макс 2 MB)' });
    }

    db.prepare(`
      INSERT INTO user_profiles
        (user_id, nickname, status_quote, specialization, info_box, snail_joke,
         avatar_id, avatar_frame, profile_bg, showcase_badges, favorite_lecture_id, is_public, custom_avatar)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        nickname            = excluded.nickname,
        status_quote        = excluded.status_quote,
        specialization      = excluded.specialization,
        info_box            = excluded.info_box,
        snail_joke          = excluded.snail_joke,
        avatar_id           = excluded.avatar_id,
        avatar_frame        = excluded.avatar_frame,
        profile_bg          = excluded.profile_bg,
        showcase_badges     = excluded.showcase_badges,
        favorite_lecture_id = excluded.favorite_lecture_id,
        is_public           = excluded.is_public,
        custom_avatar       = excluded.custom_avatar
    `).run(
      userId,
      nickname || null, status_quote || null, specialization || null,
      info_box || null, snail_joke || null,
      avatar_id || 'bug1', avatar_frame || 'default', profile_bg || 'default',
      JSON.stringify(showcase_badges || []),
      favorite_lecture_id || null, is_public ? 1 : 0,
      custom_avatar || null,
    );

    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TRADING CARDS ==============

app.get('/api/tester/cards', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const cards  = db.prepare('SELECT uc.*, l.title as lecture_title FROM user_cards uc JOIN lectures l ON uc.lecture_id = l.id WHERE uc.user_id = ? ORDER BY uc.earned_at DESC').all(userId);
    const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId);

    // Per-block progress
    const blocks = db.prepare(`
      SELECT l.skill_area,
             COUNT(*) as total,
             (SELECT COUNT(*) FROM user_cards uc WHERE uc.user_id = ? AND uc.skill_area = l.skill_area) as collected
      FROM lectures l GROUP BY l.skill_area
    `).all(userId);

    res.json({ cards, badges, blocks });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/tester/craft-badge', authMiddleware, (req, res) => {
  try {
    const { skill_area } = req.body;
    const userId = req.user.id;

    const collected = db.prepare('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ? AND skill_area = ?').get(userId, skill_area)?.c || 0;
    const total     = db.prepare('SELECT COUNT(*) as c FROM lectures WHERE skill_area = ?').get(skill_area)?.c || 0;

    if (collected < total) return res.status(400).json({ error: 'Недостаточно карточек' });
    if (db.prepare('SELECT id FROM user_badges WHERE user_id = ? AND badge_id = ?').get(userId, skill_area))
      return res.status(400).json({ error: 'Значок уже скрафчен' });

    db.prepare('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)').run(userId, skill_area);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(userId, `crafted_badge:${skill_area}`);

    const unlocks = BADGE_UNLOCKS[skill_area] || { frame: 'gold', bg: 'forest', spec: '' };
    res.json({ success: true, badge_id: skill_area, unlocks });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== CHECKLISTS ==============

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.get('/api/checklists/templates', authMiddleware, (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM checklist_templates ORDER BY order_num').all();
    const items = db.prepare('SELECT * FROM checklist_items ORDER BY template_id, order_num').all();
    const result = templates.map(t => ({
      ...t,
      items: items.filter(i => i.template_id === t.id),
    }));
    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/checklists/submit', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { template_id, task_name, content_author, verska_author, task_type, check_date, results } = req.body;

    if (!template_id || !task_name || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Неверные данные' });
    }
    if (!task_name.trim()) return res.status(400).json({ error: 'Укажите название задачи' });

    const tpl = db.prepare('SELECT id FROM checklist_templates WHERE id = ?').get(template_id);
    if (!tpl) return res.status(404).json({ error: 'Шаблон не найден' });

    // A crash partway through would otherwise leave a permanently
    // incomplete submission on the record (a row with no/partial item
    // results) — wrapped so the whole thing commits or none of it does.
    const submissionId = db.transaction(() => {
      const sub = db.prepare(`
        INSERT INTO checklist_submissions (user_id, template_id, task_name, content_author, verska_author, task_type, check_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(userId, template_id, task_name.trim(),
        content_author || '', verska_author || '', task_type || '', check_date || '');

      const insertResult = db.prepare(
        'INSERT INTO checklist_item_results (submission_id, item_id, status, note) VALUES (?, ?, ?, ?)'
      );
      let checkedCount = 0;
      let failCount = 0;
      for (const r of results) {
        if (r.item_id && r.status) {
          insertResult.run(sub.lastInsertRowid, r.item_id, r.status, (r.note || '').trim().slice(0, 1000));
          checkedCount++;
          if (r.status === 'fail') failCount++;
        }
      }

      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(userId, `checklist_submitted:${template_id}`);

      // Hidden quality signal (see submit-test's matching comment) — a
      // meaningfully-sized checklist (5+ items actually checked) with zero
      // fails found. Not "no bugs exist", just "thorough enough to be worth
      // a lead's attention" — the actual QA judgment stays with the lead.
      if (checkedCount >= 5 && failCount === 0) {
        db.prepare('INSERT INTO internal_score_events (user_id, points, reason, source) VALUES (?, ?, ?, ?)')
          .run(userId, 3, `Чистый прогон чеклиста (${checkedCount} пунктов, 0 ошибок)`, 'auto_checklist_clean');
      }

      return sub.lastInsertRowid;
    })();

    res.json({ success: true, submission_id: submissionId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: all submissions with filters
app.get('/api/checklists/submissions', authMiddleware, (req, res) => {
  try {
    const { template_id, tester, content_author, verska_author, task_type, date_from, date_to, sort = 'date_desc' } = req.query;
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const PAGE_SIZE = 50;

    let where = [];
    let params = [];

    if (template_id) { where.push('cs.template_id = ?'); params.push(template_id); }
    if (tester) { where.push('LOWER(u.name) LIKE ?'); params.push(`%${tester.toLowerCase()}%`); }
    if (content_author) { where.push('LOWER(cs.content_author) LIKE ?'); params.push(`%${content_author.toLowerCase()}%`); }
    if (verska_author) { where.push('LOWER(cs.verska_author) LIKE ?'); params.push(`%${verska_author.toLowerCase()}%`); }
    if (task_type) { where.push('cs.task_type = ?'); params.push(task_type); }
    // Filtered on submitted_at (a real, always-populated timestamp) rather
    // than check_date (free-typed by the tester, so unreliable format) —
    // see the task-types/date-range notes in ChecklistsPage.tsx.
    // datetime(), not date() — date_from/date_to arrive as full UTC instants
    // (the client converts the picked local calendar day to its UTC bounds
    // before sending), and date() would truncate both sides back to a bare
    // UTC calendar day, reintroducing the boundary mismatch this avoids.
    // datetime() still accepts a bare "YYYY-MM-DD" as midnight UTC, so old
    // callers/tests passing a plain date keep working unchanged.
    if (date_from) { where.push('datetime(cs.submitted_at) >= datetime(?)'); params.push(date_from); }
    if (date_to) { where.push('datetime(cs.submitted_at) <= datetime(?)'); params.push(date_to); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderMap = {
      date_desc: 'cs.submitted_at DESC',
      date_asc: 'cs.submitted_at ASC',
      fails_desc: 'fail_count DESC',
      fails_asc: 'fail_count ASC',
    };
    const orderBy = orderMap[sort] || 'cs.submitted_at DESC';

    const rows = db.prepare(`
      SELECT cs.id, cs.task_name, cs.content_author, cs.verska_author, cs.task_type, cs.check_date, cs.submitted_at,
             u.name as tester_name, u.avatar_initials,
             ct.name as template_name, ct.color,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as fail_count,
             COUNT(cir.id) as total_items
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      ${whereClause}
      GROUP BY cs.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE + 1, offset);

    const hasMore = rows.length > PAGE_SIZE;
    res.json({ rows: rows.slice(0, PAGE_SIZE), hasMore });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: distinct authors used in submissions
app.get('/api/checklists/authors', authMiddleware, (req, res) => {
  try {
    const contentAuthors = db.prepare(
      "SELECT DISTINCT content_author FROM checklist_submissions WHERE content_author != '' ORDER BY content_author"
    ).all().map(r => r.content_author);
    const verskaAuthors = db.prepare(
      "SELECT DISTINCT verska_author FROM checklist_submissions WHERE verska_author != '' ORDER BY verska_author"
    ).all().map(r => r.verska_author);
    res.json({ contentAuthors, verskaAuthors });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// All authenticated users: distinct task types actually used in submissions
// (free-typed by testers, so this reflects real values — not a fixed enum).
// The curated list (admin-managed — see /api/admin/task-types below), not
// just whatever's been free-typed into submissions so far. A tester can
// still type a one-off custom value at submit time (TaskTypeSelect on the
// client keeps that escape hatch) — this only drives the suggested list.
app.get('/api/checklists/task-types', authMiddleware, (req, res) => {
  try {
    const types = db.prepare('SELECT name FROM task_types ORDER BY name').all().map(r => r.name);
    res.json(types);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/task-types', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    res.json(db.prepare('SELECT id, name FROM task_types ORDER BY name').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/task-types', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Укажите название типа задачи' });
    const result = db.prepare('INSERT INTO task_types (name) VALUES (?)').run(name);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    if (isUniqueConstraintError(err)) return res.status(409).json({ error: 'Такой тип уже существует' });
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/task-types/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    db.prepare('DELETE FROM task_types WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead or submitter: detail of one submission
app.get('/api/checklists/submissions/:id', authMiddleware, (req, res) => {
  try {
    const sub = db.prepare(`
      SELECT cs.*, u.name as tester_name, ct.name as template_name, ct.color
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      WHERE cs.id = ?
    `).get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'Не найдено' });

    if (req.user.role !== 'lead' && req.user.role !== 'admin' && sub.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const results = db.prepare(`
      SELECT cir.status, cir.note, ci.text, ci.category, ci.order_num, ci.id as item_id
      FROM checklist_item_results cir
      JOIN checklist_items ci ON cir.item_id = ci.id
      WHERE cir.submission_id = ?
      ORDER BY ci.order_num
    `).all(req.params.id);

    res.json({ ...sub, results });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: stats — by template, top fails, per tester, per content/verska author.
// Accepts the same optional filters as /api/checklists/submissions
// (template_id, task_type, date_from, date_to) so a lead can scope the
// whole report to e.g. "prelending checklists in the last week" instead of
// only ever seeing an unfiltered all-time aggregate.
app.get('/api/checklists/stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { template_id, task_type, date_from, date_to } = req.query;

    const subFilters = [];
    const subParams = [];
    if (template_id) { subFilters.push('cs.template_id = ?'); subParams.push(template_id); }
    if (task_type) { subFilters.push('cs.task_type = ?'); subParams.push(task_type); }
    if (date_from) { subFilters.push('datetime(cs.submitted_at) >= datetime(?)'); subParams.push(date_from); }
    if (date_to) { subFilters.push('datetime(cs.submitted_at) <= datetime(?)'); subParams.push(date_to); }
    const subWhere = subFilters.length ? 'WHERE ' + subFilters.join(' AND ') : '';
    const subWhereAnd = subFilters.length ? 'AND ' + subFilters.join(' AND ') : '';

    const byTemplate = db.prepare(`
      SELECT ct.id, ct.name, ct.color,
             COUNT(DISTINCT cs.id) as submissions
      FROM checklist_templates ct
      LEFT JOIN checklist_submissions cs ON cs.template_id = ct.id ${subWhere ? subWhere.replace('WHERE', 'AND') : ''}
      GROUP BY ct.id
      ORDER BY ct.order_num
    `).all(...subParams);

    const topFails = db.prepare(`
      SELECT ci.text as item_text, ci.category, ct.name as template_name, ct.color,
             COUNT(*) as fail_count,
             (SELECT COUNT(*) FROM checklist_item_results cir2
              JOIN checklist_submissions cs2 ON cir2.submission_id = cs2.id
              WHERE cs2.template_id = ct.id AND cir2.item_id = ci.id ${subWhereAnd.replace(/cs\./g, 'cs2.')}) as total_checks
      FROM checklist_item_results cir
      JOIN checklist_items ci ON cir.item_id = ci.id
      JOIN checklist_submissions cs ON cir.submission_id = cs.id
      JOIN checklist_templates ct ON cs.template_id = ct.id
      WHERE cir.status = 'fail' ${subWhereAnd}
      GROUP BY ci.id
      ORDER BY fail_count DESC
      LIMIT 15
    `).all(...subParams, ...subParams);

    const byTester = db.prepare(`
      SELECT u.name as tester_name, u.avatar_initials,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      JOIN users u ON cs.user_id = u.id
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      ${subWhere}
      GROUP BY u.id
      ORDER BY submissions DESC
    `).all(...subParams);

    const byContentAuthor = db.prepare(`
      SELECT cs.content_author,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      WHERE cs.content_author != '' ${subWhereAnd}
      GROUP BY cs.content_author
      ORDER BY bugs_found DESC
      LIMIT 20
    `).all(...subParams);

    const byVerskaAuthor = db.prepare(`
      SELECT cs.verska_author,
             COUNT(DISTINCT cs.id) as submissions,
             COUNT(CASE WHEN cir.status = 'fail' THEN 1 END) as bugs_found
      FROM checklist_submissions cs
      LEFT JOIN checklist_item_results cir ON cir.submission_id = cs.id
      WHERE cs.verska_author != '' ${subWhereAnd}
      GROUP BY cs.verska_author
      ORDER BY bugs_found DESC
      LIMIT 20
    `).all(...subParams);

    res.json({ byTemplate, topFails, byTester, byContentAuthor, byVerskaAuthor });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Import checklist template from Excel (all roles)
// Coerces an exceljs cell value (which may be rich text, a formula result, a
// Date, or a plain scalar) into a plain string for the flexible row parser below.
function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString();
    return '';
  }
  return String(v);
}

// Manual template creation — the alternative to Excel import for a lead/
// admin who'd rather type a short checklist directly than build a
// spreadsheet for it. Same validation and insert shape as the import route
// below, just fed structured JSON instead of a parsed file.
app.post('/api/checklists/templates', authMiddleware, requirePermission('manage_checklists'), (req, res) => {
  try {
    const templateName = (req.body.name || '').trim();
    const templateColor = req.body.color || '#1D9E75';
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!templateName) return res.status(400).json({ error: 'Укажите название шаблона' });
    const cleanItems = items
      .map(i => ({ category: (i.category || 'Общее').trim() || 'Общее', text: (i.text || '').trim() }))
      .filter(i => i.text);
    if (cleanItems.length === 0) return res.status(400).json({ error: 'Добавьте хотя бы один пункт проверки' });

    const tplId = db.transaction(() => {
      const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM checklist_templates').get();
      const nextOrder = (maxOrder.m || 0) + 1;
      const tpl = db.prepare(
        'INSERT INTO checklist_templates (name, task_type, color, order_num) VALUES (?, ?, ?, ?)'
      ).run(templateName, templateName.toLowerCase().replace(/\s+/g, '_'), templateColor, nextOrder);

      const insertItem = db.prepare(
        'INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)'
      );
      cleanItems.forEach((item, idx) => insertItem.run(tpl.lastInsertRowid, item.category, item.text, idx + 1));

      return tpl.lastInsertRowid;
    })();

    res.json({ success: true, id: tplId, name: templateName, item_count: cleanItems.length });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Шаблон с таким названием уже существует' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/checklists/templates/import', authMiddleware, requirePermission('manage_checklists'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: 'В файле не найдено листов' });

    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      rows.push([cellToString(row.getCell(1).value), cellToString(row.getCell(2).value)]);
    });

    const templateName = (req.body.name || '').trim();
    const templateColor = req.body.color || '#1D9E75';

    if (!templateName) return res.status(400).json({ error: 'Укажите название шаблона' });

    const existing = db.prepare('SELECT id FROM checklist_templates WHERE name = ?').get(templateName);
    if (existing) return res.status(409).json({ error: 'Шаблон с таким именем уже существует' });

    // Flexible parser: works with any 1- or 2-column format.
    // Column A = category (when col B is empty) or ignored (when col B has content).
    // Column A only = item text when no col B exists in the whole sheet (single-column mode).
    // Rows that look like metadata headers (contain date/author keywords) are skipped.
    const SKIP_KEYWORDS = ['дата', 'date', 'автор', 'верстка', 'контент', 'тип задач', 'преленд', 'task', 'preland', 'author'];
    const looksLikeHeader = (a, b) =>
      SKIP_KEYWORDS.some(k => a.toLowerCase().includes(k) || b.toLowerCase().includes(k));

    // Detect if file is single-column (all content in col A, no col B at all)
    const hasTwoColumns = rows.some(r => String(r[1] || '').trim().length > 0);

    const items = [];
    let currentCategory = 'Общее';

    for (const row of rows) {
      const colA = String(row[0] || '').trim();
      const colB = String(row[1] || '').trim();

      if (!colA && !colB) continue;
      if (looksLikeHeader(colA, colB)) continue;

      if (hasTwoColumns) {
        // Two-column mode: col A = category header (when col B empty), col B = item text
        if (colA && !colB) { currentCategory = colA; continue; }
        if (colB) {
          if (colA) currentCategory = colA;
          items.push({ category: currentCategory, text: colB });
        }
      } else {
        // Single-column mode: col A alternates category / item based on indentation or just accumulates
        // Heuristic: short ALL-CAPS or ends with ":" → category, otherwise item
        const isCategoryHint = (colA === colA.toUpperCase() && colA.length > 2) || colA.endsWith(':');
        if (isCategoryHint) { currentCategory = colA.replace(/:$/, '').trim(); }
        else { items.push({ category: currentCategory, text: colA }); }
      }
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'В файле не найдено пунктов чеклиста. Проверь формат: колонка A — категория, колонка B — пункт.' });
    }

    // The category/item split above is a heuristic (ALL-CAPS or trailing ":"
    // in single-column mode), which can silently misparse an unexpected
    // layout into one flat category instead of erroring. Rather than trust
    // it blindly, surface a warning when every item landed in the fallback
    // "Общее" category — for most real checklists that's a sign the
    // category rows weren't recognized, not that the checklist is genuinely
    // flat. It's a warning, not a hard failure, since a flat list is also a
    // legitimate real format — the lead can decide whether to fix and re-import.
    const categoryBreakdown = {};
    for (const item of items) categoryBreakdown[item.category] = (categoryBreakdown[item.category] || 0) + 1;
    const categoryNames = Object.keys(categoryBreakdown);
    const suspiciousFlatImport = categoryNames.length === 1 && categoryNames[0] === 'Общее' && items.length > 5;

    // Template row + all its item rows must land together — a crash partway
    // through a large import used to be able to leave an orphaned template
    // with only some of its items.
    const tplId = db.transaction(() => {
      const maxOrder = db.prepare('SELECT MAX(order_num) as m FROM checklist_templates').get();
      const nextOrder = (maxOrder.m || 0) + 1;

      const tpl = db.prepare(
        'INSERT INTO checklist_templates (name, task_type, color, order_num) VALUES (?, ?, ?, ?)'
      ).run(templateName, templateName.toLowerCase().replace(/\s+/g, '_'), templateColor, nextOrder);

      const insertItem = db.prepare(
        'INSERT INTO checklist_items (template_id, category, text, order_num) VALUES (?, ?, ?, ?)'
      );
      items.forEach((item, idx) => insertItem.run(tpl.lastInsertRowid, item.category, item.text, idx + 1));

      return tpl.lastInsertRowid;
    })();

    res.json({
      success: true,
      id: tplId,
      name: templateName,
      item_count: items.length,
      category_count: categoryNames.length,
      warning: suspiciousFlatImport
        ? 'Все пункты попали в одну категорию «Общее» — возможно, категории в файле не распознались. Проверь исходный файл и результат импорта.'
        : null,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: 'Шаблон с таким названием уже существует' });
    }
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: update in_mvt flags per item (MVT config)
app.patch('/api/checklists/templates/:id/mvt', authMiddleware, requirePermission('manage_checklists'), (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Неверные данные' });
    const update = db.prepare('UPDATE checklist_items SET in_mvt = ? WHERE id = ? AND template_id = ?');
    for (const item of items) {
      update.run(item.in_mvt ? 1 : 0, item.id, req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Tester: task counts per template type
app.get('/api/tester/task-counts', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const rows = db.prepare(`
      SELECT ct.name, ct.task_type, ct.color,
             COUNT(cs.id) as count
      FROM checklist_templates ct
      LEFT JOIN checklist_submissions cs ON cs.template_id = ct.id AND cs.user_id = ?
      GROUP BY ct.id
      ORDER BY ct.order_num
    `).all(userId);
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== CUSTOM COURSES ==============

// List: testers see published; lead sees own + published
app.get('/api/custom-courses', authMiddleware, (req, res) => {
  try {
    let rows;
    if (req.user.role === 'lead') {
      rows = db.prepare(`
        SELECT cc.*, u.name as author_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        WHERE (cc.created_by = ? OR cc.is_published = 1) AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id, req.user.id);
    } else {
      rows = db.prepare(`
        SELECT cc.*, u.name as author_name,
          EXISTS(SELECT 1 FROM custom_course_views v WHERE v.user_id = ? AND v.course_id = cc.id) as viewed
        FROM custom_courses cc
        JOIN users u ON u.id = cc.created_by
        WHERE cc.is_published = 1 AND cc.deleted_at IS NULL
        ORDER BY cc.created_at DESC
      `).all(req.user.id);
    }
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Full course with modules, lessons, questions
app.get('/api/custom-courses/:id', authMiddleware, (req, res) => {
  try {
    const course = db.prepare(`
      SELECT cc.*, u.name as author_name
      FROM custom_courses cc JOIN users u ON u.id = cc.created_by
      WHERE cc.id = ? AND cc.deleted_at IS NULL
    `).get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!course.is_published && !canManageCourse(course, req.user)) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    db.prepare('INSERT OR IGNORE INTO custom_course_views (user_id, course_id) VALUES (?, ?)').run(req.user.id, course.id);

    const completedIds = new Set(
      db.prepare('SELECT lesson_id FROM custom_lesson_progress WHERE user_id = ?').all(req.user.id).map(r => r.lesson_id)
    );

    // Batched instead of one query per module (+ one more per quiz lesson):
    // a course with 10 modules x 5 lessons used to cost 50+ round trips for
    // a single page load. Fetch everything for the whole course in 3 fixed
    // queries total and group it back together in JS.
    const modules = db.prepare('SELECT * FROM custom_modules WHERE course_id = ? ORDER BY order_num').all(course.id);
    const moduleIds = modules.map(m => m.id);

    const allLessons = moduleIds.length
      ? db.prepare(`SELECT * FROM custom_lessons WHERE module_id IN (${moduleIds.map(() => '?').join(',')}) ORDER BY order_num`).all(...moduleIds)
      : [];
    const lessonIds = allLessons.map(l => l.id);

    const allQuestions = lessonIds.length
      ? db.prepare(`SELECT * FROM custom_quiz_questions WHERE lesson_id IN (${lessonIds.map(() => '?').join(',')}) ORDER BY order_num`).all(...lessonIds)
      : [];
    const questionsByLesson = new Map();
    for (const q of allQuestions) {
      if (!questionsByLesson.has(q.lesson_id)) questionsByLesson.set(q.lesson_id, []);
      questionsByLesson.get(q.lesson_id).push(q);
    }

    const lessonsByModule = new Map();
    for (const lesson of allLessons) {
      if (lesson.type === 'quiz') lesson.questions = questionsByLesson.get(lesson.id) || [];
      lesson.completed = completedIds.has(lesson.id);
      // Only a 'mandatory' prerequisite can lock access — 'optional' is a
      // non-blocking recommendation (e.g. unverifiable external reading),
      // and 'none' has no gate at all.
      lesson.locked = lesson.prerequisite_type === 'mandatory'
        && lesson.prerequisite_lesson_id != null
        && !completedIds.has(lesson.prerequisite_lesson_id);
      if (!lessonsByModule.has(lesson.module_id)) lessonsByModule.set(lesson.module_id, []);
      lessonsByModule.get(lesson.module_id).push(lesson);
    }
    for (const mod of modules) {
      mod.lessons = lessonsByModule.get(mod.id) || [];
    }

    res.json({ ...course, modules });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark a custom-course lesson complete. Previously this was tracked only in
// localStorage (client-only — spoofable, didn't sync across devices, and
// meant "mandatory" prerequisites had nothing real to check against).
app.post('/api/custom-lessons/:id/complete', authMiddleware, (req, res) => {
  try {
    const lesson = db.prepare('SELECT * FROM custom_lessons WHERE id = ?').get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Урок не найден' });

    if (lesson.prerequisite_type === 'mandatory' && lesson.prerequisite_lesson_id != null) {
      const prereqDone = db.prepare(
        'SELECT 1 FROM custom_lesson_progress WHERE user_id = ? AND lesson_id = ?'
      ).get(req.user.id, lesson.prerequisite_lesson_id);
      if (!prereqDone) {
        return res.status(403).json({ error: 'Сначала нужно пройти предыдущий урок' });
      }
    }

    db.prepare(
      'INSERT OR IGNORE INTO custom_lesson_progress (user_id, lesson_id) VALUES (?, ?)'
    ).run(req.user.id, lesson.id);

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Inserts modules/lessons/questions for a course and resolves 'mandatory'
// prerequisite references. The client can only know a lesson's real DB id
// after it's inserted, so a lesson picked as someone else's prerequisite is
// sent as `prerequisite_lesson_local_id` (the course-builder's client-side
// draft id) — pass 1 inserts everything and records local->real id, pass 2
// resolves those references now that every lesson has a real id.
function insertCourseModules(courseId, modules) {
  if (!Array.isArray(modules)) return;

  const localIdToRealId = new Map();
  const pendingPrereqs = []; // { lessonId, localPrereqId }

  modules.forEach((mod, mIdx) => {
    const modRow = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)').run(courseId, mod.title || '', mIdx);
    const modId = modRow.lastInsertRowid;
    if (!Array.isArray(mod.lessons)) return;

    mod.lessons.forEach((lesson, lIdx) => {
      const lessonRow = db.prepare(`
        INSERT INTO custom_lessons (module_id, title, type, content, order_num, prerequisite_type, prerequisite_note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx,
        lesson.prerequisite_type || 'none',
        lesson.prerequisite_type === 'optional' ? (lesson.prerequisite_note || '') : ''
      );
      const lessonId = lessonRow.lastInsertRowid;

      if (lesson._id) localIdToRealId.set(lesson._id, lessonId);
      if (lesson.prerequisite_type === 'mandatory' && lesson.prerequisite_lesson_local_id) {
        pendingPrereqs.push({ lessonId, localPrereqId: lesson.prerequisite_lesson_local_id });
      }

      if (lesson.type === 'quiz' && Array.isArray(lesson.questions)) {
        lesson.questions.forEach((q, qIdx) => {
          db.prepare('INSERT INTO custom_quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_idx, explanation, order_num) VALUES (?,?,?,?,?,?,?,?,?)').run(lessonId, q.question_text || '', q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', q.correct_idx ?? 0, q.explanation || '', qIdx);
        });
      }
    });
  });

  const setPrereq = db.prepare('UPDATE custom_lessons SET prerequisite_lesson_id = ? WHERE id = ?');
  for (const { lessonId, localPrereqId } of pendingPrereqs) {
    const realPrereqId = localIdToRealId.get(localPrereqId);
    if (realPrereqId) setPrereq.run(realPrereqId, lessonId);
  }
}

// Diffs incoming modules/lessons against what's already in the DB instead of
// deleting and recreating everything, so editing a course no longer wipes
// every tester's custom_lesson_progress. A module/lesson is matched to an
// existing row when its client-side `_id` is the stringified real DB id
// (the course-builder loads existing rows with `_id: String(row.id)` for
// exactly this reason); anything else is treated as newly added. Existing
// rows not present in the incoming payload were removed by the editor and
// get deleted (cascading their questions/progress). Quiz questions have no
// persistent identity anywhere (custom-course quizzes are graded
// client-side, with no per-question history to preserve), so they're always
// fully replaced — only lesson/module identity needs to survive an edit.
function updateCourseModules(courseId, modules) {
  if (!Array.isArray(modules)) return;

  const existingModuleIds = new Set(
    db.prepare('SELECT id FROM custom_modules WHERE course_id = ?').all(courseId).map(m => m.id)
  );
  const existingLessonIds = new Set(
    db.prepare(`
      SELECT cl.id FROM custom_lessons cl
      JOIN custom_modules cm ON cm.id = cl.module_id
      WHERE cm.course_id = ?
    `).all(courseId).map(l => l.id)
  );
  const usedModuleIds = new Set();
  const usedLessonIds = new Set();
  const localIdToRealId = new Map();
  const pendingPrereqs = [];

  const insertModule = db.prepare('INSERT INTO custom_modules (course_id, title, order_num) VALUES (?, ?, ?)');
  const updateModule = db.prepare('UPDATE custom_modules SET title = ?, order_num = ? WHERE id = ?');
  const insertLesson = db.prepare(`
    INSERT INTO custom_lessons (module_id, title, type, content, order_num, prerequisite_type, prerequisite_note)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateLesson = db.prepare(`
    UPDATE custom_lessons
    SET module_id = ?, title = ?, type = ?, content = ?, order_num = ?, prerequisite_type = ?, prerequisite_note = ?, prerequisite_lesson_id = NULL
    WHERE id = ?
  `);
  const insertQuestion = db.prepare(`
    INSERT INTO custom_quiz_questions (lesson_id, question_text, option_a, option_b, option_c, option_d, correct_idx, explanation, order_num)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);

  const asExistingId = (localId, existingSet) => {
    if (!localId || !/^\d+$/.test(localId)) return null;
    const n = parseInt(localId, 10);
    return existingSet.has(n) ? n : null;
  };

  modules.forEach((mod, mIdx) => {
    const matchedModId = asExistingId(mod._id, existingModuleIds);
    const modId = matchedModId
      ? (updateModule.run(mod.title || '', mIdx, matchedModId), matchedModId)
      : insertModule.run(courseId, mod.title || '', mIdx).lastInsertRowid;
    usedModuleIds.add(modId);

    (mod.lessons || []).forEach((lesson, lIdx) => {
      const prereqType = lesson.prerequisite_type || 'none';
      const prereqNote = prereqType === 'optional' ? (lesson.prerequisite_note || '') : '';
      const matchedLessonId = asExistingId(lesson._id, existingLessonIds);

      let lessonId;
      if (matchedLessonId) {
        updateLesson.run(modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx, prereqType, prereqNote, matchedLessonId);
        db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(matchedLessonId);
        lessonId = matchedLessonId;
      } else {
        lessonId = insertLesson.run(modId, lesson.title || '', lesson.type || 'lesson', lesson.content || '', lIdx, prereqType, prereqNote).lastInsertRowid;
      }
      usedLessonIds.add(lessonId);
      if (lesson._id) localIdToRealId.set(lesson._id, lessonId);
      if (prereqType === 'mandatory' && lesson.prerequisite_lesson_local_id) {
        pendingPrereqs.push({ lessonId, localPrereqId: lesson.prerequisite_lesson_local_id });
      }

      if (lesson.type === 'quiz' && Array.isArray(lesson.questions)) {
        lesson.questions.forEach((q, qIdx) => {
          insertQuestion.run(lessonId, q.question_text || '', q.option_a || '', q.option_b || '', q.option_c || '', q.option_d || '', q.correct_idx ?? 0, q.explanation || '', qIdx);
        });
      }
    });
  });

  const setPrereq = db.prepare('UPDATE custom_lessons SET prerequisite_lesson_id = ? WHERE id = ?');
  for (const { lessonId, localPrereqId } of pendingPrereqs) {
    const realPrereqId = localIdToRealId.get(localPrereqId);
    if (realPrereqId) setPrereq.run(realPrereqId, lessonId);
  }

  // Anything that existed before but wasn't touched this save was removed
  // by the editor — delete it (and its now-orphaned questions/progress).
  for (const lessonId of existingLessonIds) {
    if (usedLessonIds.has(lessonId)) continue;
    db.prepare('DELETE FROM custom_quiz_questions WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM custom_lesson_progress WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM custom_lessons WHERE id = ?').run(lessonId);
  }
  for (const modId of existingModuleIds) {
    if (!usedModuleIds.has(modId)) db.prepare('DELETE FROM custom_modules WHERE id = ?').run(modId);
  }
}

// Create course (lead only)
app.post('/api/custom-courses', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const { title, description, tag, color, requirements, modules, is_published } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите название курса' });

    // insertCourseModules is many individual statements across modules,
    // lessons, and quiz questions — wrapped so a crash partway through
    // can't leave a course with, say, a module but no lessons in it.
    const courseId = db.transaction(() => {
      const courseRow = db.prepare(`
        INSERT INTO custom_courses (title, description, tag, color, requirements, is_published, created_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        title.trim(),
        description || '',
        tag || 'Custom',
        color || '#1D9E75',
        requirements || '',
        is_published ? 1 : 0,
        req.user.id
      );
      insertCourseModules(courseRow.lastInsertRowid, modules);
      return courseRow.lastInsertRowid;
    })();

    res.json({ id: courseId });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update course (lead, own only)
app.put('/api/custom-courses/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    const { title, description, tag, color, requirements, modules, is_published } = req.body;

    // updateCourseModules is a diff (update/insert/delete across modules,
    // lessons, and quiz questions) — a crash partway through would leave
    // the course in a genuinely broken half-edited state, not just a
    // failed request, so this needs to be all-or-nothing.
    db.transaction(() => {
      db.prepare(`UPDATE custom_courses SET title=?, description=?, tag=?, color=?, requirements=?, is_published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(
        title?.trim() || course.title,
        description ?? course.description,
        tag || course.tag,
        color || course.color,
        requirements ?? course.requirements,
        is_published !== undefined ? (is_published ? 1 : 0) : course.is_published,
        course.id
      );

      if (Array.isArray(modules)) {
        updateCourseModules(course.id, modules);
      }
    })();

    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete course (lead, own only)
// Soft-delete — moves the course to the trash (see /api/admin/trash)
// instead of removing it. The full cascade delete this used to do inline
// now only runs on a real purge (hardDeleteCourse, below), since a
// trashed-but-not-yet-purged course still needs its modules/lessons intact
// in case it gets restored.
app.delete('/api/custom-courses/:id', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });

    db.prepare('UPDATE custom_courses SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(course.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Toggle publish
app.patch('/api/custom-courses/:id/publish', authMiddleware, requirePermission('manage_courses'), (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM custom_courses WHERE id = ?').get(req.params.id);
    if (!course) return res.status(404).json({ error: 'Не найдено' });
    if (!canManageCourse(course, req.user)) return res.status(403).json({ error: 'Нет доступа' });
    const newStatus = course.is_published ? 0 : 1;
    db.prepare('UPDATE custom_courses SET is_published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(newStatus, course.id);

    res.json({ is_published: newStatus });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== COURSE TIME TRACKING ==============

app.post('/api/courses/time-track', authMiddleware, (req, res) => {
  try {
    const { course_id, seconds_spent } = req.body;
    const userId = req.user.id;
    if (!course_id || typeof seconds_spent !== 'number') {
      return res.status(400).json({ error: 'Неверные данные' });
    }
    db.prepare(`
      INSERT INTO course_time_tracking (user_id, course_id, seconds_spent, completed_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, course_id) DO UPDATE SET
        seconds_spent = excluded.seconds_spent,
        completed_at = excluded.completed_at
    `).run(userId, course_id, seconds_spent);
    db.prepare('INSERT INTO activity_log (user_id, action, lecture_id) VALUES (?, ?, ?)')
      .run(userId, 'course_completed', course_id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: time stats per tester per course
app.get('/api/courses/time-stats', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id as user_id, u.name, u.avatar_initials,
        ctt.course_id,
        ctt.seconds_spent,
        ctt.completed_at
      FROM course_time_tracking ctt
      JOIN users u ON u.id = ctt.user_id
      ORDER BY ctt.completed_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== ADMIN ENDPOINTS ==============
// Deliberately its own role rather than folded into 'lead' — a team lead
// running courses/checklists for their team is a different concern from
// who can grant roles across the whole system. requireRole('admin') below
// means literally only 'admin' passes (admin doesn't need to bypass itself).

app.get('/api/admin/users', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const archived = req.query.archived === '1';
    const users = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.avatar_initials, u.created_at, u.archived_at,
        u.telegram_id IS NOT NULL as has_telegram, u.must_change_password,
        (SELECT MAX(a.created_at) FROM activity_log a WHERE a.user_id = u.id) as last_active
      FROM users u
      WHERE u.archived_at IS ${archived ? 'NOT NULL' : 'NULL'}
      ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Archive — not delete. Every table with a user_id FK stays intact; this
// only blocks login (see authMiddleware/POST /auth/login) and hides the
// account from active-team views. A lead can archive/restore testers only
// (mirrors the reset-password and permission-grant rules); admin can act
// on anyone but themselves, and never the last remaining admin.
app.post('/api/admin/users/:id/archive', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может архивировать только тестировщиков' });
    }
    if (targetId === req.user.id) return res.status(400).json({ error: 'Нельзя архивировать самого себя' });
    if (target.role === 'admin') {
      const otherAdmins = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ? AND archived_at IS NULL").get(targetId);
      if (otherAdmins.c === 0) return res.status(400).json({ error: 'Нельзя архивировать последнего администратора' });
    }

    db.prepare('UPDATE users SET archived_at = CURRENT_TIMESTAMP WHERE id = ?').run(targetId);
    revokeAllRefreshTokens(targetId);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(req.user.id, `user_archived:target=${targetId}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/users/:id/restore', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может восстанавливать только тестировщиков' });
    }
    db.prepare('UPDATE users SET archived_at = NULL WHERE id = ?').run(targetId);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(req.user.id, `user_restored:target=${targetId}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== TRASH (soft-delete recovery) ==============
// One shared "recycle bin" across the content types worth protecting from
// an accidental delete — a course took real effort to build, a bug example/
// glossary term/guide likewise. Checklist templates, permission grants,
// etc. are deliberately NOT here: they're either trivial to recreate or
// already have their own audit trail (activity_log) instead of needing
// undo. Each entity's own DELETE route sets deleted_at instead of removing
// the row (see /api/bug-examples, /api/glossary, /api/guides,
// /api/custom-courses above); this just exposes that shared state as one
// admin-facing list with restore/purge.
const TRASH_TABLES = {
  bug_examples: { label: 'Пример бага', titleCol: 'problem' },
  glossary_terms: { label: 'Термин глоссария', titleCol: 'term' },
  guides: { label: 'Гайд', titleCol: 'title' },
  custom_courses: { label: 'Курс', titleCol: 'title' },
};

app.get('/api/admin/trash', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const items = [];
    for (const [table, { label, titleCol }] of Object.entries(TRASH_TABLES)) {
      const rows = db.prepare(
        `SELECT id, ${titleCol} as title, deleted_at FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`
      ).all();
      for (const r of rows) items.push({ type: table, typeLabel: label, id: r.id, title: r.title, deleted_at: r.deleted_at });
    }
    items.sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));
    res.json(items);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/trash/:type/:id/restore', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { type, id } = req.params;
    if (!TRASH_TABLES[type]) return res.status(400).json({ error: 'Неизвестный тип' });
    db.prepare(`UPDATE ${type} SET deleted_at = NULL WHERE id = ?`).run(id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/trash/:type/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { type, id } = req.params;
    if (!TRASH_TABLES[type]) return res.status(400).json({ error: 'Неизвестный тип' });
    if (type === 'custom_courses') {
      hardDeleteCourse(parseInt(id, 10));
    } else {
      db.prepare(`DELETE FROM ${type} WHERE id = ?`).run(id);
    }
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Site-wide counts an admin needs but a lead's team dashboard doesn't show
// (that one's scoped to per-tester progress/scores) — registration mix,
// engagement over the last week/month, and how much content exists.
app.get('/api/admin/overview', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const byRole = db.prepare('SELECT role, COUNT(*) as c FROM users GROUP BY role').all();
    const totalUsers = byRole.reduce((sum, r) => sum + r.c, 0);
    const viaTelegram = db.prepare("SELECT COUNT(*) as c FROM users WHERE email LIKE '%@telegram.local'").get().c;

    const active7d = db.prepare(
      "SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at >= datetime('now', '-7 days')"
    ).get().c;
    const active30d = db.prepare(
      "SELECT COUNT(DISTINCT user_id) as c FROM activity_log WHERE created_at >= datetime('now', '-30 days')"
    ).get().c;

    const totalSubmissions = db.prepare('SELECT COUNT(*) as c FROM checklist_submissions').get().c;
    const totalCourses = db.prepare('SELECT COUNT(*) as c FROM custom_courses WHERE deleted_at IS NULL').get().c;
    const totalGuides = db.prepare('SELECT COUNT(*) as c FROM guides WHERE deleted_at IS NULL').get().c;
    const totalBugExamples = db.prepare('SELECT COUNT(*) as c FROM bug_examples WHERE deleted_at IS NULL').get().c;
    const pendingPasswordResets = db.prepare('SELECT COUNT(*) as c FROM users WHERE must_change_password = 1').get().c;

    res.json({
      totalUsers,
      byRole: Object.fromEntries(byRole.map(r => [r.role, r.c])),
      viaTelegram,
      viaEmail: totalUsers - viaTelegram,
      active7d,
      active30d,
      totalSubmissions,
      totalCourses,
      totalGuides,
      totalBugExamples,
      pendingPasswordResets,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/users/:id/role', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { role } = req.body;
    if (!isValidRole(role)) {
      return res.status(400).json({ error: `Неизвестная роль. Допустимые: ${ROLES.join(', ')}` });
    }

    const targetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Некорректный id' });
    }

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    // An admin demoting themselves away from 'admin' with no other admin
    // left would permanently lock everyone out of role management — the
    // same class of mistake as deleting your own only SSH key.
    if (targetId === req.user.id && role !== 'admin') {
      const otherAdmins = db.prepare(
        "SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND id != ?"
      ).get(targetId);
      if (otherAdmins.c === 0) {
        return res.status(400).json({ error: 'Нельзя снять последнего администратора с роли — сначала назначьте другого' });
      }
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetId);

    // activity_log rows are otherwise always "this is what user_id did" —
    // role changes are the one place that's ambiguous (the row could
    // reasonably describe the target or the actor), and there was
    // previously no record at all of *which admin* made a given change.
    // Logged under the acting admin's id, action string carries the target.
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
      .run(req.user.id, `admin_role_change:target=${targetId}:new_role=${role}`);

    const updatedTarget = db.prepare('SELECT id, email, name, role, telegram_id FROM users WHERE id = ?').get(targetId);
    notifyUser(updatedTarget, 'Роль изменена', `Твоя роль в baga-net изменена на "${role}".`);

    res.json({ ok: true, id: targetId, role });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== SCOPED PERMISSIONS ==============
// A lead can hand a specific tester a narrow, named capability (e.g.
// managing the knowledge base) without a full role change — requireRole
// grants everything that role can do, which is far more than intended for
// "let this one tester edit glossary terms." Deliberately separate from
// requireRole rather than a new role value: a role is a fixed, broad set of
// permissions; a grant is one named capability, optionally time-limited,
// revocable at any time, and never itself grants the ability to grant more
// (only 'lead'/'admin' can call the grant/revoke endpoints below).
const KNOWN_PERMISSIONS = ['manage_knowledge_base', 'manage_courses', 'manage_checklists', 'manage_guides'];

function hasPermission(userId, permission) {
  // expires_at is stored exactly as the client sends it — normally a JS
  // .toISOString() string ("...T...Z"), which sorts lexicographically
  // *after* SQLite's own datetime('now') output ("YYYY-MM-DD HH:MM:SS", no
  // "T"/"Z") for same-day values purely because 'T' (0x54) > ' ' (0x20).
  // Comparing the raw strings made same-day grants look "not yet expired"
  // for the rest of that calendar day even well past their real expiry
  // time. datetime(...) re-parses both sides into the same canonical text
  // format first, so the comparison reflects actual chronological order.
  const row = db.prepare(`
    SELECT 1 FROM granted_permissions
    WHERE user_id = ? AND permission = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
  `).get(userId, permission);
  return !!row;
}

// Like requireRole, 'admin' and 'lead' always pass — a lead doesn't need a
// grant to manage their own team's knowledge base.
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === 'lead' || req.user.role === 'admin') return next();
    if (hasPermission(req.user.id, permission)) return next();
    return res.status(403).json({ error: 'Forbidden' });
  };
}

// Any authenticated user: what am I currently allowed to do beyond my role?
// The client uses this to decide whether to show knowledge-base edit
// controls — re-checked from the DB on every call, so a revoked grant takes
// effect immediately rather than waiting for the user's JWT to expire.
app.get('/api/me/permissions', authMiddleware, (req, res) => {
  try {
    if (req.user.role === 'lead' || req.user.role === 'admin') {
      return res.json(KNOWN_PERMISSIONS);
    }
    const rows = db.prepare(`
      SELECT permission FROM granted_permissions
      WHERE user_id = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).all(req.user.id);
    res.json(rows.map(r => r.permission));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: list active grants (who has what, and until when)
app.get('/api/lead/permissions', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT gp.id, gp.permission, gp.granted_at, gp.expires_at,
             u.id as user_id, u.name as user_name, u.avatar_initials,
             gb.name as granted_by_name
      FROM granted_permissions gp
      JOIN users u ON u.id = gp.user_id
      JOIN users gb ON gb.id = gp.granted_by
      WHERE gp.expires_at IS NULL OR datetime(gp.expires_at) > datetime('now')
      ORDER BY gp.granted_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: grant a permission to a tester. expires_at is optional (ISO string
// or null for "doesn't expire on its own").
app.post('/api/lead/permissions', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { user_id, permission, expires_at } = req.body;
    if (!KNOWN_PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: `Неизвестное право. Допустимые: ${KNOWN_PERMISSIONS.join(', ')}` });
    }
    const targetId = parseInt(user_id, 10);
    const target = db.prepare('SELECT id, role, name, telegram_id FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.role !== 'tester') return res.status(400).json({ error: 'Права можно выдавать только тестировщикам — лид и админ уже имеют полный доступ' });

    // Replace any existing grant of the same permission for this user
    // instead of stacking duplicates.
    db.prepare('DELETE FROM granted_permissions WHERE user_id = ? AND permission = ?').run(targetId, permission);
    const result = db.prepare(
      'INSERT INTO granted_permissions (user_id, permission, granted_by, expires_at) VALUES (?, ?, ?, ?)'
    ).run(targetId, permission, req.user.id, expires_at || null);

    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
      .run(req.user.id, `permission_granted:target=${targetId}:permission=${permission}`);
    notifyUser(target, 'Новые права', `Тебе выдано право «${permission}» в baga-net.`);

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead: revoke a grant early
app.delete('/api/lead/permissions/:id', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const grant = db.prepare('SELECT * FROM granted_permissions WHERE id = ?').get(req.params.id);
    if (!grant) return res.status(404).json({ error: 'Не найдено' });
    db.prepare('DELETE FROM granted_permissions WHERE id = ?').run(req.params.id);
    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
      .run(req.user.id, `permission_revoked:target=${grant.user_id}:permission=${grant.permission}`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== RECOGNITION / BONUSES ==============
// Two separate ledgers, deliberately not mixed:
//  - bonus_awards / premium_points: visible to the tester, lead-awarded,
//    meant to eventually convert to something real-world (e.g. an отгул —
//    that conversion itself is a manual, off-app decision for now).
//  - internal_score_events: invisible to the tester, awarded automatically
//    by the server itself when a quality+speed bar is cleared (see the
//    submit-test and checklist-submit routes) — purely a signal for a lead
//    to see who's quietly excellent, never shown to or gameable by the
//    tester it's about.
// Neither is real money — that's a payroll/accounting decision this app
// deliberately doesn't process; see /api/admin/bonus-candidates for the
// admin-facing report meant to inform (not replace) that human decision.
const MAX_BONUS_AMOUNT = 500;

app.post('/api/lead/award-bonus', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const { user_id, amount, reason } = req.body;
    const targetId = parseInt(user_id, 10);
    const amt = parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_BONUS_AMOUNT) {
      return res.status(400).json({ error: `Сумма должна быть от 1 до ${MAX_BONUS_AMOUNT}` });
    }
    if (!reason?.trim()) return res.status(400).json({ error: 'Укажите причину премии' });

    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (target.role !== 'tester') return res.status(400).json({ error: 'Премию можно начислить только тестировщику' });

    db.transaction(() => {
      db.prepare('INSERT INTO bonus_awards (user_id, amount, reason, awarded_by) VALUES (?, ?, ?, ?)')
        .run(targetId, amt, reason.trim(), req.user.id);
      db.prepare(`
        INSERT INTO user_profiles (user_id, premium_points) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET premium_points = COALESCE(premium_points, 0) + excluded.premium_points
      `).run(targetId, amt);
    })();

    notifyUser(target, 'Премия!', `Тебе начислено ${amt} премиальных баллов: «${reason.trim()}»`);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Self-service — the tester's own visible balance + history. Deliberately
// only ever reads bonus_awards, never internal_score_events.
app.get('/api/me/premium-points', authMiddleware, (req, res) => {
  try {
    const profile = db.prepare('SELECT premium_points FROM user_profiles WHERE user_id = ?').get(req.user.id);
    const history = db.prepare(`
      SELECT amount, reason, awarded_at, ab.name as awarded_by_name
      FROM bonus_awards ba JOIN users ab ON ab.id = ba.awarded_by
      WHERE ba.user_id = ? ORDER BY ba.awarded_at DESC LIMIT 20
    `).all(req.user.id);
    res.json({ premium_points: profile?.premium_points || 0, history });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Lead-only — "who's quietly excellent". Ranked by the hidden auto-scored
// points (quality+speed, anti-cheat-checked — see submit-test), with
// visible premium_points shown alongside for context. Never reachable by a
// tester about themselves.
app.get('/api/lead/internal-ratings', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id, u.name, u.avatar_initials,
        (SELECT COALESCE(SUM(points), 0) FROM internal_score_events WHERE user_id = u.id) as hiddenScore,
        (SELECT COALESCE(premium_points, 0) FROM user_profiles WHERE user_id = u.id) as premiumPoints,
        (SELECT COUNT(*) FROM internal_score_events WHERE user_id = u.id AND source = 'auto_quiz_excellence') as excellentQuizzes,
        (SELECT COUNT(*) FROM internal_score_events WHERE user_id = u.id AND source = 'auto_checklist_clean') as cleanChecklists
      FROM users u
      WHERE u.role = 'tester' AND u.archived_at IS NULL
      ORDER BY hiddenScore DESC
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lead/bonus-awards', authMiddleware, requireRole('lead'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ba.id, ba.amount, ba.reason, ba.awarded_at, u.name as user_name, ab.name as awarded_by_name
      FROM bonus_awards ba
      JOIN users u ON u.id = ba.user_id
      JOIN users ab ON ab.id = ba.awarded_by
      ORDER BY ba.awarded_at DESC
      LIMIT 50
    `).all();
    res.json(rows);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: a ranked "who's earning it" report over the last 30 days — real
// payroll/bonus decisions stay a human (admin) call, this just surfaces the
// input data (pass rate, activity, checklist volume) instead of making
// someone dig through raw tables to find it.
app.get('/api/admin/bonus-candidates', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.id, u.name,
        (SELECT COUNT(*) FROM test_results tr WHERE tr.user_id = u.id AND tr.completed_at >= datetime('now', '-30 days')) as quizzesLast30d,
        (SELECT AVG(score) FROM test_results tr WHERE tr.user_id = u.id AND tr.completed_at >= datetime('now', '-30 days')) as avgScoreLast30d,
        (SELECT COUNT(*) FROM checklist_submissions cs WHERE cs.user_id = u.id AND cs.submitted_at >= datetime('now', '-30 days')) as submissionsLast30d,
        (SELECT COALESCE(SUM(ba.amount), 0) FROM bonus_awards ba WHERE ba.user_id = u.id) as totalBonusReceived
      FROM users u
      WHERE u.role = 'tester'
      ORDER BY (submissionsLast30d + quizzesLast30d) DESC
    `).all();
    res.json(rows.map(r => ({ ...r, avgScoreLast30d: r.avgScoreLast30d ? Math.round(r.avgScoreLast30d) : null })));
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== KNOWLEDGE BASE (Багодельня) ==============

app.get('/api/bug-examples', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM bug_examples WHERE deleted_at IS NULL ORDER BY created_at DESC').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/bug-examples', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    if (!problem?.trim() || !bad_text?.trim() || !good_text?.trim()) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    const result = db.prepare(
      'INSERT INTO bug_examples (tag, tag_color, problem, bad_text, good_text, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run((tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text.trim(), good_text.trim(), req.user.id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM bug_examples WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { tag, tag_color, problem, bad_text, good_text } = req.body;
    if (!problem?.trim() || !bad_text?.trim() || !good_text?.trim()) {
      return res.status(400).json({ error: 'Заполните проблему, плохой и хороший пример' });
    }
    db.prepare(
      'UPDATE bug_examples SET tag = ?, tag_color = ?, problem = ?, bad_text = ?, good_text = ? WHERE id = ?'
    ).run((tag || 'Общее').trim(), tag_color || '#7F77DD', problem.trim(), bad_text.trim(), good_text.trim(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/bug-examples/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    db.prepare('UPDATE bug_examples SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/glossary', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM glossary_terms WHERE deleted_at IS NULL ORDER BY term ASC').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/glossary', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const { term, definition } = req.body;
    if (!term?.trim() || !definition?.trim()) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    const result = db.prepare(
      'INSERT INTO glossary_terms (term, definition, created_by) VALUES (?, ?, ?)'
    ).run(term.trim(), definition.trim(), req.user.id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM glossary_terms WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { term, definition } = req.body;
    if (!term?.trim() || !definition?.trim()) {
      return res.status(400).json({ error: 'Заполните термин и определение' });
    }
    db.prepare('UPDATE glossary_terms SET term = ?, definition = ? WHERE id = ?').run(term.trim(), definition.trim(), req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/glossary/:id', authMiddleware, requirePermission('manage_knowledge_base'), (req, res) => {
  try {
    db.prepare('UPDATE glossary_terms SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============== GUIDES ==============
// Lead/admin (or a granted tester — see manage_guides) editable articles,
// meant to replace the team's external Notion docs. Content is a plain
// safe-markdown-subset string (see client GuidesPage's renderer) — never
// raw HTML, so there's no dangerouslySetInnerHTML/XSS surface.

app.get('/api/guides', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT id, title, category, updated_at, created_at FROM guides WHERE deleted_at IS NULL ORDER BY category, title').all());
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/guides/:id', authMiddleware, (req, res) => {
  try {
    const guide = db.prepare('SELECT * FROM guides WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!guide) return res.status(404).json({ error: 'Не найдено' });
    res.json(guide);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/guides', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const { title, category, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    const result = db.prepare(
      'INSERT INTO guides (title, category, content, created_by) VALUES (?, ?, ?, ?)'
    ).run(title.trim(), (category || 'Общее').trim(), content || '', req.user.id);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM guides WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Не найдено' });
    const { title, category, content } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Укажите заголовок' });
    db.prepare('UPDATE guides SET title = ?, category = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title.trim(), (category || 'Общее').trim(), content || '', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/guides/:id', authMiddleware, requirePermission('manage_guides'), (req, res) => {
  try {
    db.prepare('UPDATE guides SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

export { cleanupRefreshTokens };
export default app;

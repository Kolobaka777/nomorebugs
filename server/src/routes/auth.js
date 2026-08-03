// Authentication: register/login/refresh/logout, password change/reset,
// and Telegram login/linking. Split out from the old monolithic app.js —
// see PROGRESS.md.
import express from 'express';
import bcryptjs from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { db } from '../../db/schema.js';
import { logError } from '../sentry.js';
import {
  generateAccessToken, generateRefreshToken, hashToken, authMiddleware, requireRole, REFRESH_TOKEN_TTL_MS,
} from '../auth.js';
import { DEFAULT_ROLE } from '../roles.js';
import {
  isTelegramConfigured, createTelegramToken, buildDeepLink, pollTelegramToken, notifyUser, notifyUserConfirmed,
} from '../telegram.js';
import { isUniqueConstraintError, revokeAllRefreshTokens } from '../routeHelpers.js';

const router = express.Router();

// Same allowlist app.js's CORS config computes — the reset-password email
// link needs the client's real origin, not a hardcoded one.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// The refresh token used to be handed to the client as a JSON field and
// stored in localStorage right alongside the access token — that defeated
// the whole point of the access token's short TTL, since an XSS payload
// could just read both and mint fresh sessions indefinitely. As an httpOnly
// cookie it's invisible to any JS running on the page (client or injected),
// scoped to /api/auth so it's never even sent along with ordinary API
// calls, and SameSite=None+Secure in production because the frontend and
// backend live on different Railway subdomains (a cross-site relationship
// from the cookie spec's point of view) — 'lax' is enough in dev, where
// client/server differ only by port on the same "site" (localhost).
const REFRESH_COOKIE_NAME = 'refreshToken';
function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',
  };
}
function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...refreshCookieOptions(), maxAge: REFRESH_TOKEN_TTL_MS });
}
function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

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
// endpoints below. Deliberately returns the same shape as /login (access
// token + user in the JSON body, refresh token as an httpOnly cookie) so
// the client can treat "just registered" and "just logged in" identically.
router.post('/api/auth/register', registerLimiter, (req, res) => {
  try {
    const { email, password, name, gender } = req.body;

    // Was `!email || !password || !name?.trim()` — a non-string field (e.g.
    // a JSON number) slipped past that falsy check and then crashed a
    // string method a few lines down (name?.trim(), password.length,
    // bcryptjs.hashSync expecting a string) into an opaque 500 instead of a
    // normal 400.
    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !email || !password || !name.trim()) {
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
    if (gender !== undefined && gender !== null && gender !== 'male' && gender !== 'female') {
      return res.status(400).json({ error: 'Некорректное значение пола' });
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

    // Safe partial insert — every other user_profiles column has a default,
    // so this just creates the row with gender set (or skips it entirely
    // when unspecified, same as before this field existed).
    if (gender === 'male' || gender === 'female') {
      db.prepare('INSERT INTO user_profiles (user_id, gender) VALUES (?, ?)').run(user.id, gender);
    }

    db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)').run(user.id, 'register');
    db.prepare('INSERT INTO team_events (event_type, user_id) VALUES (?, ?)').run('member_joined', user.id);

    // Fire-and-forget — Telegram if linked (it never is at this point for a
    // fresh email/password signup, so this realistically goes to the SMTP
    // fallback if configured, or is silently skipped otherwise), never
    // blocks the response on notification delivery.
    notifyUser(user, 'Регистрация в baga-net', `Аккаунт "${user.name}" зарегистрирован. Добро пожаловать в нору!`);

    setRefreshCookie(res, refresh.token);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials, displayName: null, gender: gender ?? null },
      needsBaselineSurvey: user.role === 'tester',
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Per-account login lockout — see the comment inside the route below for
// why this exists alongside loginLimiter's per-IP throttle.
const failedLoginAttempts = new Map(); // emailKey -> { count, lockedUntil }
const MAX_FAILED_LOGIN_ATTEMPTS = 8;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function recordFailedLogin(emailKey) {
  const entry = failedLoginAttempts.get(emailKey) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  entry.lastAttempt = Date.now();
  if (entry.count >= MAX_FAILED_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  failedLoginAttempts.set(emailKey, entry);
}

// A successful login already clears its own entry (see below), but an
// account that's mistyped once and never tries again — or a one-off scan
// against emails that don't even exist — left an entry behind forever,
// growing this Map without bound over a long server uptime. A stale entry
// (no attempt in a day, well past the 15-min lockout window either way) is
// safe to drop — the next failed attempt just starts a fresh count.
const IDLE_ENTRY_TTL_MS = 24 * 60 * 60 * 1000;
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of failedLoginAttempts) {
      if (now - entry.lastAttempt > IDLE_ENTRY_TTL_MS) failedLoginAttempts.delete(key);
    }
  }, 60 * 60 * 1000).unref();
}

router.post('/api/auth/login', loginLimiter, (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // loginLimiter above only throttles per source IP — a distributed
    // attacker (rotating IPs/a botnet) could still throw unlimited attempts
    // at one specific account. Tracked by email regardless of whether the
    // account actually exists, and with the exact same locked response
    // either way, so this can't become a new email-enumeration signal on
    // top of the timing one already guarded against below. In-memory and
    // single-instance only (this app's documented numReplicas: 1
    // constraint) — resets on a restart, an acceptable gap for an internal
    // tool, not something an outside attacker can trigger on demand.
    const emailKey = email.trim().toLowerCase();
    const lockout = failedLoginAttempts.get(emailKey);
    if (lockout?.lockedUntil && lockout.lockedUntil > Date.now()) {
      return res.status(429).json({ error: 'Слишком много неудачных попыток входа. Попробуйте позже.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Always pay the bcrypt cost, even when the email doesn't exist —
    // short-circuiting on `!user` would return in microseconds for a
    // nonexistent email but the full bcrypt-10 cost for a wrong password,
    // and that timing gap is itself an email-enumeration side channel
    // despite the identical response body below.
    const passwordMatches = bcryptjs.compareSync(password, user?.password || DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
      recordFailedLogin(emailKey);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    failedLoginAttempts.delete(emailKey);
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

    // The nickname set on the profile page (e.g. "I'm BOSS") lives in
    // user_profiles, not users — without this, the nav dropdown only ever
    // learns about it if the account happens to visit /profile or /cabinet
    // in the same browser session (see ProfilePage.tsx/MoyaNora.tsx syncing
    // it via onUserUpdate after a fetch), so on a fresh login it silently
    // showed the account's real name instead of the nickname everywhere else.
    // gender rides along the same way, for the same reason — it's needed
    // wherever the client renders text about "you" (e.g. HomePage's "Ты
    // ещё не прошёл(а)..."), and living in user_profiles means a fresh
    // login is the only point that reaches it without an extra fetch.
    const profileRow = db.prepare('SELECT nickname, gender FROM user_profiles WHERE user_id = ?').get(user.id);

    setRefreshCookie(res, refresh.token);
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials,
        displayName: profileRow?.nickname || null, gender: profileRow?.gender || null,
      },
      needsBaselineSurvey,
      mustChangePassword: !!user.must_change_password,
    });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Exchanges a valid, non-revoked refresh token (read from the httpOnly
// cookie, never the request body) for a new short-lived access token.
router.post('/api/auth/refresh', refreshLimiter, (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token invalid or expired' });

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
router.post('/api/auth/logout', logoutLimiter, (req, res) => {
  try {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      db.prepare('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?')
        .run(hashToken(refreshToken));
    }
    clearRefreshCookie(res);
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

function generateTempPassword() {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars, URL-safe
}

// Self-service — the account is already logged in and knows its current password.
router.put('/api/me/password', authMiddleware, passwordChangeLimiter, (req, res) => {
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

    // revokeAllRefreshTokens above also revokes the CURRENT session's own
    // refresh token — without reissuing one here, the tab that just changed
    // its own password kept working until the access token's 15-min TTL
    // ran out, then got silently logged out on the next refresh with no
    // explanation of why. Mirrors login's token issuance.
    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const token = generateAccessToken(freshUser);
    const refresh = generateRefreshToken();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(freshUser.id, refresh.hash, refresh.expiresAt.toISOString());
    setRefreshCookie(res, refresh.token);

    res.json({ ok: true, token });
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
router.post('/api/admin/users/:id/reset-password', authMiddleware, requireRole('lead'), async (req, res) => {
  try {
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    if (req.user.role === 'lead' && target.role !== 'tester') {
      return res.status(403).json({ error: 'Лид может сбрасывать пароль только тестировщикам' });
    }

    const tempPassword = generateTempPassword();
    // A crash between the password update and revoking old refresh tokens
    // used to be able to leave a stale session valid under the old password
    // while a new temp password was already handed out under the new one.
    db.transaction(() => {
      db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?')
        .run(bcryptjs.hashSync(tempPassword, 10), target.id);
      revokeAllRefreshTokens(target.id);
      db.prepare('INSERT INTO activity_log (user_id, action) VALUES (?, ?)')
        .run(req.user.id, `password_reset:target=${target.id}`);
    })();

    // Uses the delivery-confirmed variant (not the fire-and-forget
    // notifyUser used elsewhere) specifically because the response below
    // decides whether to show the lead the raw temp password to relay by
    // hand — claiming "delivered via Telegram" when the send actually
    // failed (bot blocked, chat gone) used to leave the lead with no way
    // to give the tester their new password at all.
    const delivered = await notifyUserConfirmed(
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
router.post('/api/auth/forgot-password', forgotPasswordLimiter, (req, res) => {
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

router.post('/api/auth/reset-password', forgotPasswordLimiter, (req, res) => {
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

router.post('/api/auth/telegram/start', telegramStartLimiter, (req, res) => {
  try {
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
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/auth/telegram/poll/:token', telegramPollLimiter, (req, res) => {
  try {
    const result = pollTelegramToken(req.params.token);
    // Mirrors the email/password login/register routes: the refresh token
    // travels as an httpOnly cookie, never in the JSON the client's own JS
    // can read — pollTelegramToken() itself still returns it internally
    // (telegram.js's own tests rely on that), it's just stripped here before
    // the response actually leaves the server.
    if (result.status === 'ready' && result.refreshToken) {
      setRefreshCookie(res, result.refreshToken);
      const { refreshToken, ...rest } = result;
      return res.json(rest);
    }
    res.json(result);
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Authenticated: lets an existing (e.g. email/password) account attach
// Telegram after the fact, purely so it can start receiving notifications
// and use Telegram to log in going forward — no new session is issued.
router.post('/api/auth/telegram/link/start', authMiddleware, telegramStartLimiter, (req, res) => {
  try {
    if (!isTelegramConfigured()) {
      return res.status(503).json({ error: 'Telegram временно недоступен' });
    }
    const { token, expiresAt } = createTelegramToken(req.user.id);
    const deepLink = buildDeepLink(token);
    if (!deepLink) {
      return res.status(503).json({ error: 'Telegram-бот ещё запускается, попробуйте через пару секунд' });
    }
    res.json({ token, deepLink, expiresAt });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/api/auth/telegram/status', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT telegram_id, telegram_username FROM users WHERE id = ?').get(req.user.id);
    res.json({ linked: !!user?.telegram_id, telegramUsername: user?.telegram_username || null });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/api/auth/telegram/unlink', authMiddleware, (req, res) => {
  try {
    // A user who registered *through* Telegram (see telegram.js) gets a
    // synthetic `tg{id}@telegram.local` email and an unknowable random
    // password — Telegram is their ONLY way to ever log in again. Unlinking
    // used to be allowed unconditionally, which permanently locked such a
    // user out with no self-service recovery (forgot-password and email
    // delivery both already deliberately skip @telegram.local addresses).
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
    if (user?.email.endsWith('@telegram.local')) {
      return res.status(400).json({ error: 'Это единственный способ входа в твой аккаунт — сначала попроси лида задать email и пароль, потом можно будет отвязать Telegram' });
    }
    db.prepare('UPDATE users SET telegram_id = NULL, telegram_username = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logError(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

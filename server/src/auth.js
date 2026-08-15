import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Sentry, isSentryEnabled } from './sentry.js';
import { db } from '../db/schema.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Copy server/.env.example to server/.env ' +
    'and set a value (see the generation command in that file).'
  );
}

// Access tokens are short-lived JWTs sent as a Bearer header on every request.
// Kept short so a leaked token (e.g. via XSS) is only useful for a limited
// window — long-lived sessions are handled separately via refresh tokens.
const ACCESS_TOKEN_TTL = '15m';

// Refresh tokens are long-lived, opaque, revocable, and only ever sent to
// POST /api/auth/refresh and /api/auth/logout — never attached to normal
// API requests, so they can't be replayed by an attacker who only manages
// to intercept a regular API call.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateAccessToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Generates a new opaque refresh token. Returns both the raw token (sent to
// the client once, never stored) and its SHA-256 hash (what actually gets
// persisted) — mirrors how passwords are handled, so the DB alone is never
// enough to impersonate a session if it leaks.
export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // A still-valid (not yet expired) access token issued before an admin
  // archived this account would otherwise keep working for up to its full
  // 15-minute TTL — checked here, not just at login, so archiving actually
  // cuts access off immediately rather than "eventually".
  const userRow = db.prepare('SELECT role, archived_at, must_change_password FROM users WHERE id = ?').get(decoded.id);
  if (!userRow || userRow.archived_at) {
    return res.status(403).json({ error: 'Аккаунт деактивирован или не найден' });
  }

  // The client shows a full-screen forced password-change prompt after a
  // lead/admin reset and renders nothing else until it's done — but that
  // was only ever a client-side nag: a direct API call could ignore it
  // indefinitely and keep using the temporary password. Enforced here too,
  // with the one route the prompt itself needs left reachable.
  if (userRow.must_change_password && req.path !== '/api/me/password') {
    return res.status(403).json({ error: 'Сначала нужно сменить временный пароль', code: 'MUST_CHANGE_PASSWORD' });
  }

  // Same reasoning as archived_at above, found in the 2026-08-15 audit:
  // decoded.role is a snapshot from whenever this access token was issued,
  // up to 15 minutes stale. A lead demoted mid-session (e.g. for cause)
  // would otherwise keep every requireRole('lead') gate open — award
  // bonuses, reset a tester's password, read team notes — until their old
  // token happened to expire. granted_permissions is already re-checked
  // from the DB on every request (routeHelpers.js); role gets the same
  // treatment here rather than trusting the JWT's copy of it.
  req.user = { ...decoded, role: userRow.role };
  // Tags every Sentry event captured for the rest of this request with who
  // hit it — without this, logError()/the Express error handler report
  // errors with no way to tell which user (or role) was actually affected.
  if (isSentryEnabled()) {
    Sentry.getCurrentScope().setUser({ id: String(decoded.id), username: userRow.role });
  }
  next();
}

// 'admin' always passes, regardless of which role a route asks for — so
// granting a user admin access doesn't require going through every
// requireRole() call site in app.js and adding it to an allow-list.
// Scaling to more roles later (layout designer, content manager, ...)
// only ever means adding new requireRole('whatever') routes, never
// touching this function.
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

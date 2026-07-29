import * as Sentry from '@sentry/node';

// Self-initializing on import, deliberately — ESM hoists all `import`
// statements above any other top-level code in a file, so a plain
// `export function initSentry() {...}` called later from app.js would run
// too late to instrument express/http/etc. before app.js's own imports of
// them execute. Importing *this* file first (see app.js) and having it
// initialize itself as a side effect is what actually gets the ordering
// right. No-op without SENTRY_DSN, and never active under tests — there's
// no DSN in CI, and a deliberately-thrown test error is noise, not a real
// incident worth shipping anywhere.
const enabled = !!process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test';

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  console.log('Sentry error tracking enabled');
}

export function isSentryEnabled() {
  return enabled;
}

// Most routes in this app catch their own errors and respond directly
// (never calling next(err)), so Sentry's Express integration alone would
// almost never see them — it only captures errors that propagate through
// Express's own error-handling chain. This is the actual capture point for
// those; use it in place of a bare console.error(err) in a route's catch
// block.
export function logError(err, context) {
  console.error(err);
  if (enabled) {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  }
}

export { Sentry };

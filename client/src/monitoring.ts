import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthogEnabled = false;

// Called once at boot (main.tsx), before the first render. Both integrations
// are entirely inert without their env var, so this is safe to call
// unconditionally in every environment, including local dev and tests.
export function initMonitoring() {
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
  }
  if (POSTHOG_KEY) {
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: true });
    posthogEnabled = true;
  }
}

// Ties error/analytics events to the logged-in user — role included, since
// for an internal tool "which role is hitting this" matters more than raw
// counts. Call on login and on session restore (a page refresh with an
// existing session); reverse with resetAnalyticsUser on logout.
export function identifyUser(user: { id: number; email: string; role: string }) {
  if (SENTRY_DSN) Sentry.setUser({ id: String(user.id), email: user.email, username: user.role });
  if (posthogEnabled) posthog.identify(String(user.id), { email: user.email, role: user.role });
}

export function resetAnalyticsUser() {
  if (SENTRY_DSN) Sentry.setUser(null);
  if (posthogEnabled) posthog.reset();
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  if (SENTRY_DSN) Sentry.captureException(error, extra ? { extra } : undefined);
}

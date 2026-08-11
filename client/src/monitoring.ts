// @sentry/react and posthog-js are dynamically imported (below) rather than
// statically, so Vite code-splits them into their own async-loaded chunk
// instead of bundling them into the eagerly-loaded main entry chunk with
// React/react-router/axios. Everything in this file that talks to either SDK
// (identifyUser/resetAnalyticsUser/captureError) can be called before that
// chunk finishes loading — see runOrQueue — so callers don't need to know
// or care that initialization is now async.
type SentryModule = typeof import('@sentry/react');
type PosthogModule = typeof import('posthog-js').default;

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let Sentry: SentryModule | null = null;
let posthog: PosthogModule | null = null;
let posthogEnabled = false;

// Calls made before the dynamic-imported SDKs finish loading are queued
// here (in order) and flushed once initMonitoring resolves, instead of
// being silently dropped — e.g. identifyUser fires from an App-mount effect
// right after boot, which can easily race the dynamic import.
let ready = false;
let queue: Array<() => void> = [];

function runOrQueue(fn: () => void) {
  if (ready) fn();
  else queue.push(fn);
}

// Called once at boot (main.tsx), before the first render — not awaited
// there, so it initializes in the background while the app renders. Both
// integrations are entirely inert without their env var, so this is safe to
// call unconditionally in every environment, including local dev and tests.
export async function initMonitoring() {
  const tasks: Promise<void>[] = [];

  if (SENTRY_DSN) {
    tasks.push(
      import('@sentry/react').then(mod => {
        Sentry = mod;
        Sentry.init({
          dsn: SENTRY_DSN,
          environment: import.meta.env.MODE,
          tracesSampleRate: 0.1,
        });
      })
    );
  }

  if (POSTHOG_KEY) {
    tasks.push(
      import('posthog-js').then(mod => {
        posthog = mod.default;
        posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: true });
        posthogEnabled = true;
      })
    );
  }

  await Promise.all(tasks);
  ready = true;
  const pending = queue;
  queue = [];
  pending.forEach(fn => fn());
}

// Ties error/analytics events to the logged-in user — role included, since
// for an internal tool "which role is hitting this" matters more than raw
// counts. Call on login and on session restore (a page refresh with an
// existing session); reverse with resetAnalyticsUser on logout.
export function identifyUser(user: { id: number; email: string; role: string }) {
  runOrQueue(() => {
    if (Sentry) Sentry.setUser({ id: String(user.id), email: user.email, username: user.role });
    if (posthogEnabled && posthog) posthog.identify(String(user.id), { email: user.email, role: user.role });
  });
}

export function resetAnalyticsUser() {
  runOrQueue(() => {
    if (Sentry) Sentry.setUser(null);
    if (posthogEnabled && posthog) posthog.reset();
  });
}

export function captureError(error: unknown, extra?: Record<string, unknown>) {
  runOrQueue(() => {
    if (Sentry) Sentry.captureException(error, extra ? { extra } : undefined);
  });
}

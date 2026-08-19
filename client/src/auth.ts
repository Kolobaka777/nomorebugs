import { API_BASE_URL } from './config';

const TOKEN_KEY = 'token';
// No longer written to — kept only so clearSession() can scrub a leftover
// value from a browser that logged in before the refresh token moved to an
// httpOnly cookie (see setRefreshCookie/REFRESH_COOKIE_NAME in the server's
// app.js). Without this, that old token would sit in localStorage forever,
// unused but still readable by any future XSS, defeating the point of the
// migration for anyone who doesn't happen to log out and back in.
const LEGACY_REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';
const NEEDS_BASELINE_KEY = 'needsBaselineSurvey';
const MUST_CHANGE_PASSWORD_KEY = 'mustChangePassword';

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): any | null {
  const raw = localStorage.getItem(USER_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function getNeedsBaselineSurvey(): boolean {
  return localStorage.getItem(NEEDS_BASELINE_KEY) === 'true';
}

export function getMustChangePassword(): boolean {
  return localStorage.getItem(MUST_CHANGE_PASSWORD_KEY) === 'true';
}

export function setSession(token: string, user: any, needsBaselineSurvey: boolean, mustChangePassword = false) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(NEEDS_BASELINE_KEY, String(needsBaselineSurvey));
  localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, String(mustChangePassword));
}

export function setNeedsBaselineSurvey(value: boolean) {
  localStorage.setItem(NEEDS_BASELINE_KEY, String(value));
}

export function setMustChangePassword(value: boolean) {
  localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, String(value));
}

// Patches the locally-stored user object (e.g. after a profile edit changes
// the nickname shown in the nav) without touching tokens/session state.
// Returns the merged object so the caller can push it into React state too —
// localStorage alone doesn't trigger a re-render.
export function updateStoredUser(patch: Record<string, any>): any {
  const current = getStoredUser() || {};
  const merged = { ...current, ...patch };
  localStorage.setItem(USER_KEY, JSON.stringify(merged));
  return merged;
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(NEEDS_BASELINE_KEY);
  localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
}

export async function serverLogout(): Promise<void> {
  try {
    // No body needed — the refresh token rides along automatically as the
    // httpOnly cookie set by the server on login (see setRefreshCookie in
    // server/src/app.js). credentials:'include' is what makes the browser
    // actually attach it cross-origin.
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // Logging out is best-effort — local session is cleared regardless by the caller.
  }
}

// Coalesces concurrent 401s into a single in-flight refresh request instead
// of each one independently racing to refresh.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        // No refreshToken to read/send here anymore — it lives in an
        // httpOnly cookie the browser attaches on its own (credentials:
        // 'include'), scoped server-side to /api/auth so it never rides
        // along with ordinary API calls. Whether a session is refreshable
        // at all is now something only the server can answer.
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return null;
        const data = await res.json();
        setAccessToken(data.token);
        return data.token as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// The session can no longer be refreshed (refresh token missing/expired/revoked).
// App.tsx listens for this to log the user out cleanly with a clear message,
// instead of leaving the UI in a broken, silently-unauthenticated state.
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

function sessionExpired() {
  clearSession();
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

// Exposed for api.ts's axios response interceptor, which handles the retry
// itself (axios needs the new token to rebuild its own request config).
export async function tryRefreshAccessToken(): Promise<string | null> {
  const token = await refreshAccessToken();
  if (!token) sessionExpired();
  return token;
}

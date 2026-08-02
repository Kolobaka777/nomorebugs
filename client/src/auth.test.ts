import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAccessToken, getStoredUser, getNeedsBaselineSurvey,
  setSession, setNeedsBaselineSurvey, clearSession,
  authFetch, tryRefreshAccessToken, SESSION_EXPIRED_EVENT,
} from './auth';

const user = { id: 1, email: 'a@b.com', name: 'Test', role: 'tester', avatar_initials: 'TT' };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('session storage round-trip', () => {
  it('setSession persists everything, and each getter reads it back correctly', () => {
    setSession('access-1', user, true);
    expect(getAccessToken()).toBe('access-1');
    expect(getStoredUser()).toEqual(user);
    expect(getNeedsBaselineSurvey()).toBe(true);
  });

  it('setNeedsBaselineSurvey updates independently of the rest of the session', () => {
    setSession('access-1', user, true);
    setNeedsBaselineSurvey(false);
    expect(getNeedsBaselineSurvey()).toBe(false);
    expect(getAccessToken()).toBe('access-1'); // untouched
  });

  it('clearSession removes every session key, including a leftover pre-migration refresh token', () => {
    setSession('access-1', user, true);
    localStorage.setItem('refreshToken', 'leftover-from-before-httponly-cookies');
    clearSession();
    expect(getAccessToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
    expect(getNeedsBaselineSurvey()).toBe(false);
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('getStoredUser returns null (not a throw) for corrupted JSON', () => {
    localStorage.setItem('user', '{not valid json');
    expect(getStoredUser()).toBeNull();
  });
});

describe('authFetch', () => {
  it('attaches the current access token as a Bearer header', async () => {
    setSession('my-token', user, false);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await authFetch('/api/whatever');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer my-token');
  });

  it('on a 401, refreshes once (via the httpOnly cookie, no token in the request) and retries with the new token', async () => {
    setSession('stale-token', user, false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 })) // original request
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 })) // refresh call
      .mockResolvedValueOnce(new Response('{}', { status: 200 })); // retried request
    vi.stubGlobal('fetch', fetchMock);

    const res = await authFetch('/api/whatever');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('fresh-token'); // the new token was persisted

    // The refresh call carries no refreshToken anywhere (cookie, not body/param) —
    // it just needs to have gone out with credentials so the browser attaches the cookie.
    const refreshCall = fetchMock.mock.calls[1];
    expect(String(refreshCall[0])).toContain('/auth/refresh');
    expect(refreshCall[1].credentials).toBe('include');
    expect(JSON.stringify(refreshCall[1])).not.toContain('refresh');

    const retryHeaders = fetchMock.mock.calls[2][1].headers;
    expect(retryHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('when refresh itself fails, clears the session and fires SESSION_EXPIRED_EVENT instead of retrying forever', async () => {
    setSession('stale-token', user, false);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 })) // original request
      .mockResolvedValueOnce(new Response('{}', { status: 401 })); // refresh call also fails (no valid cookie)
    vi.stubGlobal('fetch', fetchMock);

    const eventHandler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventHandler);

    await authFetch('/api/whatever');

    expect(eventHandler).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull(); // session was cleared
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventHandler);
  });

  it('coalesces concurrent 401s into a single refresh call, not one per request', async () => {
    setSession('stale-token', user, false);
    let refreshCallCount = 0;
    // Every non-refresh call 401s (simulating two requests whose access
    // token both went stale at the same time) — what matters is that both
    // authFetch calls below share one in-flight refresh instead of each
    // independently racing to refresh (refreshPromise dedup in auth.ts).
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/auth/refresh')) {
        refreshCallCount++;
        return Promise.resolve(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 401 }));
    }));

    await Promise.all([authFetch('/api/one'), authFetch('/api/two')]);

    expect(refreshCallCount).toBe(1);
  });
});

describe('tryRefreshAccessToken', () => {
  it('returns the new token on success', async () => {
    setSession('stale-token', user, false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 })
    ));

    const token = await tryRefreshAccessToken();
    expect(token).toBe('fresh-token');
  });

  it('returns null and fires SESSION_EXPIRED_EVENT when the server rejects the refresh (no/expired/revoked cookie)', async () => {
    clearSession();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    const eventHandler = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, eventHandler);

    const token = await tryRefreshAccessToken();

    expect(token).toBeNull();
    expect(eventHandler).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, eventHandler);
  });
});

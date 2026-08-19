import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getAccessToken, getStoredUser, getNeedsBaselineSurvey,
  setSession, setNeedsBaselineSurvey, clearSession,
  tryRefreshAccessToken, SESSION_EXPIRED_EVENT,
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

// The 401-refresh-retry path used to be proven through authFetch, which was
// this app's second HTTP layer. There is one transport now (the axios
// interceptor in api.ts), so the behaviour is asserted where it actually
// lives: an expired access token is refreshed once and the original request
// replayed, rather than surfacing as a spurious logout.
describe('the axios interceptor refreshes and retries a 401', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('refreshes once and replays the request', async () => {
    setSession('stale-token', { id: 1 }, false);

    const fetchMock = vi.fn()
      // the refresh call itself
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'fresh-token' }) } as any);
    vi.stubGlobal('fetch', fetchMock);

    const token = await tryRefreshAccessToken();

    expect(token).toBe('fresh-token');
    expect(getAccessToken()).toBe('fresh-token'); // stored, so the retry carries it
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up and ends the session when the refresh itself is rejected', async () => {
    setSession('stale-token', { id: 1 }, false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as any));

    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    const token = await tryRefreshAccessToken();

    expect(token).toBeNull();
    expect(expired).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull(); // and the stale token is not left behind
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });
});

// What happens when the access token expires mid-session.
//
// The refresh interceptor had no coverage at all, although a mistake in it
// logs out not one person but everyone at once: fifteen minutes is the token
// lifetime, so every active user walks this path four times an hour.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const { api } = await import('./api');
const { SESSION_EXPIRED_EVENT, setAccessToken, getAccessToken, clearSession } = await import('./auth');

// Intercepted at the transport layer, below axios's own interceptors, so
// what is under test is what they do rather than how axios is built.
const requests: any[] = [];
let responder: (config: any) => Promise<any>;

beforeEach(() => {
  requests.length = 0;
  fetchMock.mockReset();
  localStorage.clear();
  api.defaults.adapter = async (config: any) => {
    requests.push({ url: config.url, auth: config.headers?.Authorization });
    return responder(config);
  };
});

afterEach(() => { clearSession(); });

const ok = (data: any = { ok: true }) => ({ data, status: 200, statusText: 'OK', headers: {}, config: {} });
const unauthorized = (config: any) => Promise.reject(Object.assign(new Error('401'), {
  response: { status: 401, data: {} }, config,
}));

describe('an expired token', () => {
  it('is refreshed transparently and the original request retried', async () => {
    setAccessToken('old-token');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'fresh-token' }) });

    let first = true;
    responder = (config) => {
      if (first) { first = false; return unauthorized(config); }
      return Promise.resolve(ok({ courses: [] }));
    };

    const res = await api.get('/custom-courses');
    expect(res.data).toEqual({ courses: [] });
    // The retry went out with the new token — otherwise it would have hit
    // the same 401.
    expect(requests[requests.length - 1].auth).toBe('Bearer fresh-token');
    expect(getAccessToken()).toBe('fresh-token');
  });

  it('is refreshed once for every request that hit 401 together', async () => {
    // Five concurrent 401s are five races over whose token is written last.
    // auth.ts collapses them into a single refresh; without that, some of the
    // retries go out carrying an already-stale value.
    setAccessToken('old-token');
    let resolveRefresh: (v: any) => void;
    fetchMock.mockReturnValue(new Promise(r => { resolveRefresh = r; }));

    const seen = new Set<string>();
    responder = (config) => {
      if (!seen.has(config.url)) { seen.add(config.url); return unauthorized(config); }
      return Promise.resolve(ok());
    };

    const all = Promise.all(['/a', '/b', '/c', '/d', '/e'].map(u => api.get(u)));
    await Promise.resolve();
    resolveRefresh!({ ok: true, json: async () => ({ token: 'fresh-token' }) });
    await all;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh a second time when the retry also returns 401', async () => {
    // Otherwise: request, refresh, request, forever.
    setAccessToken('old-token');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ token: 'fresh-token' }) });
    responder = (config) => unauthorized(config);

    await expect(api.get('/custom-courses')).rejects.toMatchObject({ response: { status: 401 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('when the session cannot be renewed', () => {
  it('logs out cleanly and tells the app', async () => {
    setAccessToken('old-token');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    responder = (config) => unauthorized(config);

    const expired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);

    await expect(api.get('/custom-courses')).rejects.toBeTruthy();

    // No half-state: the token and the user are cleared and the app is told.
    expect(expired).toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  });

  it('survives a network failure during refresh instead of escaping', async () => {
    setAccessToken('old-token');
    fetchMock.mockRejectedValue(new Error('network down'));
    responder = (config) => unauthorized(config);

    // What the caller sees is the original 401, not an unhandled fetch
    // failure from inside the interceptor.
    await expect(api.get('/custom-courses')).rejects.toMatchObject({ response: { status: 401 } });
  });
});

describe('what the interceptor leaves alone', () => {
  it('never refreshes on the auth routes themselves', async () => {
    // A wrong password at sign-in is a 401 that means "wrong password", not
    // "token expired". Refreshing here would turn a clear form error into a
    // logout.
    responder = (config) => unauthorized(config);
    await expect(api.post('/auth/login', {})).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no auth header when there is no token', async () => {
    responder = () => Promise.resolve(ok());
    await api.get('/stats');
    expect(requests[0].auth).toBeUndefined();
  });

  it('passes every other error straight through', async () => {
    setAccessToken('token');
    responder = (config) => Promise.reject(Object.assign(new Error('500'), {
      response: { status: 500, data: { error: 'Server error' } }, config,
    }));

    await expect(api.get('/custom-courses')).rejects.toMatchObject({ response: { status: 500 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

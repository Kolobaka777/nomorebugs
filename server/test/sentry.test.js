import { describe, it, expect, vi } from 'vitest';

// Deliberately no SENTRY_DSN here — this suite verifies the "not
// configured" behavior, which is also what every other test file in the
// suite implicitly relies on (none of them expect Sentry calls to fire).
// NODE_ENV is 'test' by default under Vitest, which alone would disable
// Sentry even if a DSN were present — see sentry.js.

const { isSentryEnabled, logError } = await import('../src/sentry.js');

describe('sentry.js without SENTRY_DSN configured', () => {
  it('isSentryEnabled() is false', () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it('logError() still logs to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logError(err);
    expect(spy).toHaveBeenCalledWith(err);
    spy.mockRestore();
  });

  it('logError() never throws even with extra context supplied', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logError(new Error('with context'), { route: '/api/whatever' })).not.toThrow();
    consoleSpy.mockRestore();
  });
});

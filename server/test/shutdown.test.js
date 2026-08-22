// The path every deploy takes.
//
// Railway sends SIGTERM on each deploy and restart, so this runs more often
// than most of the app — and had no test, while docker-entrypoint.sh exists
// largely to keep the signal reaching it. What is being protected is the
// order: the database must not close until the server has let its in-flight
// requests finish, or a deploy silently truncates whatever was mid-write.
import { describe, it, expect, vi } from 'vitest';
import { createShutdown, FORCE_EXIT_AFTER_MS } from '../src/shutdown.js';

// On shutdown.js being absent from the coverage report: the cause is found
// and written down in the module itself — the v8 provider drops a file loaded
// only by a test rather than through the application graph. Verified by
// experiment: without this file shutdown.js appears at 0%, with it the row
// vanishes. `all: true` changes nothing. The tests below are real; only the
// number is missing.

// A server whose close() hands back its callback instead of running it, so
// a test can decide when "in-flight requests finished" happens.
function fakeServer() {
  let pending = null;
  return {
    close: cb => { pending = cb; },
    finishRequests: () => pending?.(),
    get closed() { return pending !== null; },
  };
}

const harness = (over = {}) => {
  const order = [];
  const server = over.server || fakeServer();
  const deps = {
    server,
    db: { close: () => order.push('db.close') },
    stopTelegramBot: () => order.push('telegram'),
    stopBackupSchedule: () => order.push('backups'),
    exit: code => order.push(`exit:${code}`),
    log: () => {},
    error: () => {},
    ...over,
  };
  return { shutdown: createShutdown(deps), order, server };
};

describe('graceful shutdown', () => {
  it('does not close the database until the server has drained', () => {
    const { shutdown, order, server } = harness();

    shutdown('SIGTERM');
    // This is the assertion the whole module exists for. If db.close() ever
    // moves out of server.close()'s callback, requests still being served
    // lose their database mid-response — on every deploy.
    expect(order).not.toContain('db.close');

    server.finishRequests();
    expect(order).toContain('db.close');
  });

  it('stops the bot and the backup schedule before waiting on the server', () => {
    const { shutdown, order } = harness();
    shutdown('SIGTERM');
    expect(order).toEqual(['telegram', 'backups']);
  });

  it('exits zero only after the database is closed', () => {
    const { shutdown, order, server } = harness();
    shutdown('SIGTERM');
    server.finishRequests();
    expect(order).toEqual(['telegram', 'backups', 'db.close', 'exit:0']);
  });

  it('forces an exit when a connection never closes', () => {
    vi.useFakeTimers();
    const { shutdown, order } = harness();

    shutdown('SIGTERM');
    vi.advanceTimersByTime(FORCE_EXIT_AFTER_MS + 1);

    // A stuck long-poll must not hold a deploy open forever — but the
    // database was never closed, because the server never said it was done.
    expect(order).toContain('exit:1');
    expect(order).not.toContain('db.close');
    vi.useRealTimers();
  });

  it('does not force an exit when the server drains in time', () => {
    vi.useFakeTimers();
    const { shutdown, order, server } = harness();

    shutdown('SIGTERM');
    server.finishRequests();
    vi.advanceTimersByTime(FORCE_EXIT_AFTER_MS + 1);

    expect(order.filter(o => o.startsWith('exit:'))).toEqual(['exit:0']);
    vi.useRealTimers();
  });

  it('ignores a second signal instead of tearing down twice', () => {
    // A supervisor that repeats SIGTERM, or sends SIGINT after it, would
    // otherwise call server.close() again — which invokes the callback with
    // an error and closes the database while the first pass is still
    // draining.
    const { shutdown, order, server } = harness();

    shutdown('SIGTERM');
    shutdown('SIGINT');
    server.finishRequests();

    expect(order.filter(o => o === 'telegram')).toHaveLength(1);
    expect(order.filter(o => o === 'db.close')).toHaveLength(1);
    expect(order.filter(o => o.startsWith('exit:'))).toEqual(['exit:0']);
  });

  it('never lets its own timer keep the process alive', () => {
    const { shutdown } = harness();
    const timer = shutdown('SIGTERM');
    // unref'd, or the thing that exists to end the process would be the
    // thing preventing it from ending.
    expect(timer.hasRef()).toBe(false);
  });
});

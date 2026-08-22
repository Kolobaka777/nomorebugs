// What has to happen, and in what order, when the platform says stop.
//
// On coverage: this file does not appear in the report at all — not at 0%,
// absent — although test/shutdown.test.js exercises every branch. Verified
// by experiment: remove that test and the file reappears at 0%; put it back
// and it vanishes. The v8 provider drops a module loaded *only* by a test
// rather than through the application graph, and this is the one such
// module (everything else under src/ is reachable from app.js, which every
// other test imports). The tests are real; it is the number that is missing.
//
// Extracted from index.js so it can be tested. Railway sends SIGTERM on
// every deploy and every restart, so this path runs more often than almost
// anything else in the app — and it ran with no test at all, while
// docker-entrypoint.sh was written specifically to keep the signal reaching
// it (`su` swallowed it; `setpriv` does not). The order below is the whole
// point: closing the database before the server has let its in-flight
// requests finish pulls the floor out from under them, and it would look
// like data mysteriously lost on deploys rather than like a broken shutdown.
export const FORCE_EXIT_AFTER_MS = 10000;

export function createShutdown({ server, db, stopTelegramBot, stopBackupSchedule, exit, log = console.log, error = console.error }) {
  let started = false;

  return function shutdown(signal) {
    // A platform that sends SIGTERM and then SIGINT, or a supervisor that
    // repeats the signal, must not start a second teardown on top of the
    // first — server.close() called twice invokes its callback with an
    // error, which would close the database while the first pass is still
    // draining requests.
    if (started) return;
    started = true;

    log(`${signal} received, shutting down gracefully...`);
    stopTelegramBot();
    stopBackupSchedule();

    // Belt-and-suspenders: force exit if some connection (e.g. a stuck
    // long-poll) never closes on its own, so a deploy can't hang forever.
    // Cleared once the drain finishes — under process.exit() the difference
    // never shows, since the process is gone before it could fire, but a
    // timer left armed after a clean shutdown is a contradiction waiting for
    // the first caller that does not immediately die.
    const timer = setTimeout(() => {
      error('Forced shutdown — a connection did not close within the grace period.');
      exit(1);
    }, FORCE_EXIT_AFTER_MS);

    server.close(() => {
      clearTimeout(timer);
      db.close();
      log('Shutdown complete.');
      exit(0);
    });
    // Never hold the process open on account of the timer that exists to
    // close it.
    timer.unref?.();
    return timer;
  };
}

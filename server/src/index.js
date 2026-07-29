import app from './app.js';
import { db } from '../db/schema.js';
import { stopTelegramBot } from './telegram.js';
import { stopBackupSchedule } from './backup.js';

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Railway (and most PaaS/container platforms) send SIGTERM on every deploy
// or scale event, then SIGKILL shortly after if the process hasn't exited.
// Without this, in-flight requests get their connection reset mid-response
// on every single deploy — server.close() stops accepting new connections
// and only fires its callback once existing ones finish, which is the
// first safe point to close the DB handle.
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  stopTelegramBot();
  stopBackupSchedule();
  server.close(() => {
    db.close();
    console.log('Shutdown complete.');
    process.exit(0);
  });
  // Belt-and-suspenders: force exit if some connection (e.g. a stuck
  // long-poll) never closes on its own, so a deploy can't hang forever.
  setTimeout(() => {
    console.error('Forced shutdown — a connection did not close within the grace period.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

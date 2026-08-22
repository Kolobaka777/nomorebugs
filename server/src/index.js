import app from './app.js';
import { db } from '../db/schema.js';
import { stopTelegramBot } from './telegram.js';
import { stopBackupSchedule } from './backup.js';
import { createShutdown } from './shutdown.js';

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Railway (and most PaaS/container platforms) send SIGTERM on every deploy
// or scale event, then SIGKILL shortly after if the process hasn't exited.
// Without this, in-flight requests get their connection reset mid-response
// on every single deploy. The order of operations is in shutdown.js, which
// is where it can be tested.
const shutdown = createShutdown({
  server,
  db,
  stopTelegramBot,
  stopBackupSchedule,
  exit: code => process.exit(code),
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

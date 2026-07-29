import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, '..', 'src', 'index.js');

// Exercises the real process — index.js's SIGTERM handling isn't reachable
// through an in-process supertest request, since that never actually goes
// through server.listen()/process signal handling. This is what Railway
// (or any container platform) does to the old process on every deploy.
describe('graceful shutdown', () => {
  it('closes cleanly on SIGTERM: logs shutdown messages and exits 0', async () => {
    const child = spawn(process.execPath, [indexPath], {
      env: {
        ...process.env,
        PORT: '5099',
        DB_PATH: ':memory:',
        JWT_SECRET: 'test-secret-do-not-use-in-prod',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stdout += d.toString(); });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server never logged "Server running" — output so far:\n${stdout}`)), 10000);
      const check = setInterval(() => {
        if (stdout.includes('Server running')) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });

    const exit = new Promise((resolve) => {
      child.on('exit', (code, signal) => resolve({ code, signal }));
    });

    child.kill('SIGTERM');
    const { code } = await exit;

    // Windows has no real SIGTERM — Node emulates it by unconditionally
    // force-killing the process (equivalent to `taskkill /f`), so the
    // in-process 'SIGTERM' handler never actually runs there, regardless
    // of whether the handler itself is correct. Railway (and every real
    // deployment target for this app) is Linux, where this is a real
    // signal and the assertions below are the actual, meaningful check —
    // Windows only gets a "did it at least start and stop" smoke check.
    if (process.platform === 'win32') {
      expect(code === 0 || code === null).toBe(true);
      return;
    }

    expect(stdout).toContain('SIGTERM received, shutting down gracefully');
    expect(stdout).toContain('Shutdown complete');
    expect(code).toBe(0);
  }, 15000);
});

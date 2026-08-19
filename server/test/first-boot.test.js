// What happens on a database with no users in it. This is the only code
// path a deployment takes exactly once, which is why it broke without
// anyone noticing: the guard that stops demo accounts (whose passwords are
// in this repository) from being seeded onto a real deployment also
// rejected `docker compose up`, because the compose file sets CORS_ORIGIN
// and nothing set NODE_ENV — and an unset NODE_ENV is precisely what that
// guard reads as "nobody decided".
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const indexPath = path.join(__dirname, '..', 'src', 'index.js');

// A fresh process per case: app.js seeds and applies its guard on import,
// so this cannot be exercised in-process by a suite that has already
// imported it once.
function boot(env, { expectStart = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [indexPath], {
      env: {
        PATH: process.env.PATH,
        PORT: String(5100 + Math.floor(Number(env.__port) || 0)),
        DB_PATH: ':memory:',
        JWT_SECRET: 'test-secret-do-not-use-in-prod',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { out += d.toString(); });

    const done = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Neither started nor exited within 15s. Output:\n${out}`));
    }, 15000);

    if (expectStart) {
      const poll = setInterval(() => {
        if (out.includes('Server running')) {
          clearInterval(poll);
          clearTimeout(done);
          child.kill('SIGTERM');
          resolve({ started: true, out });
        }
      }, 50);
      child.on('exit', code => {
        clearInterval(poll);
        clearTimeout(done);
        if (!out.includes('Server running')) resolve({ started: false, code, out });
      });
    } else {
      child.on('exit', code => {
        clearTimeout(done);
        resolve({ started: out.includes('Server running'), code, out });
      });
    }
  });
}

describe('first boot on an empty database', () => {
  it('starts the documented compose stack instead of refusing', async () => {
    // Exactly what docker-compose.yml provides: a CORS origin, a
    // production NODE_ENV baked into the image, and a bootstrap admin.
    const res = await boot({
      __port: '1',
      NODE_ENV: 'production',
      CORS_ORIGIN: 'http://localhost:8080',
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'a-real-password',
    });
    expect(res.out).toContain('Production admin account created');
    expect(res.started).toBe(true);
  }, 20000);

  it('still refuses to seed demo accounts into a deployment', async () => {
    // The guard's actual job: CORS_ORIGIN set (so this looks deployed) and
    // NODE_ENV left unset (so nobody chose). Five accounts with published
    // passwords must not appear on the internet because a variable was
    // forgotten.
    const res = await boot({ __port: '2', CORS_ORIGIN: 'https://real.example.com' }, { expectStart: false });
    expect(res.started).toBe(false);
    expect(res.code).not.toBe(0);
    expect(res.out).toContain('Отказ запуска');
  }, 20000);

  it('warns rather than starting silently unusable when the admin is missing', async () => {
    // Production, no ADMIN_EMAIL: nothing is seeded and nobody can log in.
    // It starts — an existing deployment restarting with an empty DB
    // shouldn't be blocked — but it has to say so.
    const res = await boot({ __port: '3', NODE_ENV: 'production', CORS_ORIGIN: 'https://real.example.com' });
    expect(res.started).toBe(true);
    expect(res.out).toContain('set ADMIN_EMAIL/ADMIN_PASSWORD');
  }, 20000);
});

// The image and the compose file are the two things that decide which of
// the branches above a real deployment lands in.
describe('deployment manifests', () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'server', 'Dockerfile'), 'utf8');
  const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');

  it('bakes NODE_ENV=production into the server image', () => {
    expect(dockerfile).toMatch(/^ENV NODE_ENV=production$/m);
  });

  it('requires the bootstrap admin, the way it requires the JWT secret', () => {
    // `${VAR:?message}` is compose's "fail if unset". Without it the stack
    // comes up with zero accounts and no way in — a worse failure than
    // refusing to start, because it looks like success.
    expect(compose).toMatch(/ADMIN_EMAIL: \$\{ADMIN_EMAIL:\?/);
    expect(compose).toMatch(/ADMIN_PASSWORD: \$\{ADMIN_PASSWORD:\?/);
  });

  it('waits for a healthy server before starting the client', () => {
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toContain('healthcheck:');
  });
});

// The nginx config can't be exercised here — there is no nginx in the test
// environment — so this asserts the one property whose violation is
// invisible until someone inspects response headers in production. It
// lives in this file because it is the same kind of check as the two
// above: a deployment manifest nothing else reads.
describe('nginx config', () => {
  const raw = fs.readFileSync(path.join(repoRoot, 'client', 'nginx.conf.template'), 'utf8');
  // Comments stripped, so a `# add_header ...` explaining the trap doesn't
  // read as the trap itself.
  const config = raw.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');

  it('sets every security header', () => {
    for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy']) {
      expect(config, header).toContain(`add_header ${header}`);
    }
  });

  it('declares add_header at exactly one level', () => {
    // nginx's add_header does not accumulate across levels: a location
    // block that declares any add_header of its own inherits none of the
    // ones above it. That is how `location /assets/ { add_header
    // Cache-Control ... }` came to strip the CSP, X-Frame-Options and
    // nosniff from every JavaScript file the app serves, while the config
    // still read as though the headers were set.
    const firstLocation = config.indexOf('location ');
    const insideLocations = firstLocation === -1 ? '' : config.slice(firstLocation);
    expect(insideLocations).not.toContain('add_header');
  });

  it('marks the headers `always`, so error responses carry them too', () => {
    for (const line of config.split('\n')) {
      if (line.trim().startsWith('add_header')) expect(line.trim(), line.trim()).toMatch(/always;$/);
    }
  });

  it('does not leave connect-src open', () => {
    // `connect-src *` permits exfiltration to any host, which is most of
    // what a CSP is for — it made the rest of the policy decorative.
    expect(config).not.toMatch(/connect-src\s+\*/);
    expect(config).toContain("connect-src 'self'");
  });

  it('keeps index.html out of the immutable cache bucket', () => {
    // A fingerprinted asset is safe to cache forever; the HTML that names
    // it is not, or a deploy ships files nobody is told to fetch.
    expect(config).toMatch(/default\s+"no-cache"/);
    expect(config).toMatch(/~\^\/assets\/\s+"public, max-age=31536000, immutable"/);
  });
});

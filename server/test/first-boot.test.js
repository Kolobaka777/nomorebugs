// What happens on a database with no users in it. This is the only code
// path a deployment takes exactly once, which is why it broke without
// anyone noticing: the guard that stops demo accounts (whose passwords are
// in this repository) from being seeded onto a real deployment also
// rejected `docker compose up`, because the compose file sets CORS_ORIGIN
// and nothing set NODE_ENV — and an unset NODE_ENV is precisely what that
// guard reads as "nobody decided".
import { describe, it, expect } from 'vitest';
import { spawn, execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
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

// The CSP's connect-src is worked out by a shell expression inside
// client/Dockerfile. There is no docker here to build the image, but the
// expression itself is the part that can be wrong — and was: it did not
// exist, the value was an empty variable an operator had to remember, and
// forgetting it shipped a policy that blocked every request the app makes.
//
// So this lifts the real line out of the Dockerfile and runs it, rather
// than restating it — a copy of the expression in a test would keep passing
// after the original changed.
describe('CSP origin derivation', () => {
  // The origin the browser is allowed to call is worked out by
  // client/docker-entrypoint.d/10-csp-origin.sh. There is no docker here to
  // build the image, but the shell is the part that can be wrong — and was.
  // The script takes its paths from the environment precisely so this can
  // run the real file against fixtures instead of restating its logic; a
  // copy in a test keeps passing after the original changes.
  const script = path.join(repoRoot, 'client', 'docker-entrypoint.d', '10-csp-origin.sh');
  const template = path.join(repoRoot, 'client', 'nginx.conf.template');

  function connectSrc({ apiOrigin = '', baseUrl = '', baked = '' } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-'));
    try {
      const tpl = path.join(dir, 'default.conf.template');
      const bakedFile = path.join(dir, 'csp-origin');
      fs.copyFileSync(template, tpl);
      fs.writeFileSync(bakedFile, baked);
      execFileSync('sh', [script], {
        env: {
          PATH: process.env.PATH,
          API_ORIGIN: apiOrigin,
          VITE_API_BASE_URL: baseUrl,
          CSP_TEMPLATE: tpl,
          CSP_BAKED: bakedFile,
        },
        encoding: 'utf8',
      });
      // Comments stripped first: the template explains the directive by
      // name a few lines above it, and reading that instead of the real
      // one is a mistake both this and the entrypoint's own guard made.
      const rendered = fs.readFileSync(tpl, 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
      return rendered.match(/connect-src ([^;]*)/)[1].trim();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('allows the origin of the URL the bundle was built against', () => {
    expect(connectSrc({ baseUrl: 'https://nomorebugs-production.up.railway.app/api' }))
      .toBe("'self' https://nomorebugs-production.up.railway.app");
    expect(connectSrc({ baseUrl: 'http://localhost:5001/api' })).toBe("'self' http://localhost:5001");
  });

  it('falls back to the value baked in at build when the container has none', () => {
    // Which of build or run a platform hands the variable to is the
    // platform's business. Deriving it in both places is what stops that
    // being a deployment's problem.
    expect(connectSrc({ baked: 'https://baked.example.com' })).toBe("'self' https://baked.example.com");
  });

  it('lets an explicit API_ORIGIN win over both', () => {
    expect(connectSrc({
      apiOrigin: 'https://explicit.example.com',
      baseUrl: 'https://other.example.com/api',
      baked: 'https://baked.example.com',
    })).toBe("'self' https://explicit.example.com");
  });

  it("leaves connect-src at 'self' for a same-origin deployment", () => {
    // One hostname with a reverse proxy in front of both halves.
    expect(connectSrc({ baseUrl: '/api' })).toBe("'self'");
    expect(connectSrc()).toBe("'self'");
  });

  // The other half: the value the image carries when the container's own
  // environment has nothing. This step is what failed the Railway build —
  // it ended in `! grep -q 'API_ORIGIN'`, meant to catch an unsubstituted
  // placeholder, which instead matched the word API_ORIGIN in a comment a
  // few lines above the directive and so failed every single build.
  it('bakes the origin in at build without a guard that cannot pass', () => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, 'client', 'Dockerfile'), 'utf8');
    const line = dockerfile
      .replace(/\\\n/g, ' ')
      .split('\n')
      .find(l => l.trim().startsWith('RUN printf') && l.includes('csp-origin'));
    expect(line, 'the build step that records the origin must still be findable').toBeTruthy();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-build-'));
    try {
      const out = path.join(dir, 'csp-origin');
      const cmd = line.replace(/^\s*RUN\s+/, '').replace(/\/etc\/nginx\/csp-origin/g, out);
      // Runs it for real: the failure being guarded against was a non-zero
      // exit, which only executing the thing can show.
      execFileSync('sh', ['-c', cmd], {
        env: { PATH: process.env.PATH, VITE_API_BASE_URL: 'https://nomorebugs-production.up.railway.app/api', API_ORIGIN: '' },
        encoding: 'utf8',
      });
      expect(fs.readFileSync(out, 'utf8')).toBe('https://nomorebugs-production.up.railway.app');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves no placeholder behind for nginx to choke on', () => {
    for (const args of [{ baseUrl: 'https://a.example.com/api' }, {}]) {
      expect(connectSrc(args)).not.toContain('API_ORIGIN');
    }
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

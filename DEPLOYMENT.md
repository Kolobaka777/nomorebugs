# Deployment

**Hosting: Railway.** Decision rationale below, then the actual migration
steps from Vercel.

## Why Railway (and not Vercel, a VPS, or Render)

The app is an Express API backed by `better-sqlite3` — a single-writer,
single-file database that needs a real persistent disk and a long-running
process. Vercel's serverless functions are stateless and short-lived by
design: the SQLite file would either not persist between invocations at all,
or (worse) silently work in a way that corrupts data the moment two
invocations touch it concurrently. This isn't a Vercel configuration
problem to work around — it's a fundamental mismatch, which is why no
`vercel.json`/serverless entrypoint exists in this repo. The client (static
Vite build) is genuinely fine on Vercel; it's specifically the API that
can't live there.

Options considered for where the API (and, for simplicity, the client too)
should live instead:

| Option | Verdict |
|---|---|
| **Railway** | **Chosen.** Native Docker builds from a Dockerfile, persistent volumes for the SQLite file, automatic HTTPS on a generated domain, per-service environment variables, GitHub-integrated deploys, straightforward usage-based pricing. Least operational burden of the stateful options. |
| Render | Viable alternative — Docker + persistent disks exist, but disks require a paid plan and the free tier's cold-start behavior is worse for a small always-on internal tool. Keep as a fallback if Railway pricing/limits become a problem. |
| Fly.io | Also viable, volumes are solid — but its config format (`fly.toml`) and regional-deployment model add complexity this app doesn't need at its current scale. |
| Bare VPS (DigitalOcean/Hetzner) + `docker compose up -d` | Cheapest long-term, most control — but you own OS patching, the reverse proxy, and TLS renewal yourself. Right call if cost becomes the dominant concern later; not the right starting point for "maximize quality and stability with no deadline pressure." |

Railway most directly matches what you asked for ("a PaaS supporting
stateful containers/volumes") with the least new operational surface area
to maintain.

## Architecture on Railway

Two independent Railway services in one project, each built from this
monorepo with its **Root Directory** set per-service:

- **`server`** — Root Directory `server/`, builds `server/Dockerfile`,
  config in `server/railway.json`. Has a **volume** mounted at `/data`
  (matches `DB_PATH=/data/learning_hub.db` already set in the Dockerfile).
  **Do not mount the volume at `/app/db`** — that directory also holds
  application code (`schema.js`, `seed.js`), and a volume mount replaces a
  directory's contents entirely, so mounting there hides those files and
  crashes the app with `ERR_MODULE_NOT_FOUND` on every boot.
  Exposes `GET /api/health` for Railway's healthcheck (added this
  iteration — checks the DB actually responds, not just that the process
  is alive).
- **`client`** — Root Directory `client/`, builds `client/Dockerfile`,
  config in `client/railway.json`. Nginx now listens on `$PORT` via an
  envsubst template (`nginx.conf.template`) instead of a hardcoded `80` —
  Railway assigns the port at runtime, so a fixed `listen 80` would not
  have been reachable.

`docker-compose.yml` at the repo root remains for **local dev/testing only**
— Railway does not read it; each service is deployed independently.

## Migration steps (Vercel → Railway)

1. **Create the Railway project.** [railway.app](https://railway.app) →
   New Project → Deploy from GitHub repo → select this repo.

2. **Add the `server` service.**
   - Settings → Root Directory: `server`
   - Settings → Variables:
     - `JWT_SECRET` — generate fresh, **never reuse the local dev value**:
       ```bash
       node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
       ```
     - `CORS_ORIGIN` — the client's Railway URL once it exists (step 4 —
       circular, so come back and set this after the client service is up).
     - `NODE_ENV=production` — besides the usual meaning, this also flips the
       refresh-token cookie to `Secure; SameSite=None` (required because the
       client and server live on different Railway subdomains). Railway
       terminates HTTPS for you, so this needs no extra setup — it only
       matters if this app is ever deployed somewhere served over plain
       HTTP, where login would appear to work but every session would fail
       to refresh after 15 minutes (the cookie would silently never be set).
     - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — **required for a first production
       boot with an empty database.** The dev/test auto-seeded demo accounts
       (lead@qa.com etc., published passwords) are deliberately disabled
       once `NODE_ENV=production` — without these two set, a fresh deploy
       comes up with zero accounts and nobody can log in at all. Only used
       once, on the very first boot against an empty `users` table; set a
       real password here, and change it via the app once logged in (these
       env vars aren't read again after that first boot).
     - `REGISTRATION_ALLOWED_DOMAINS` — optional but **strongly recommended
       before the URL is shared with anyone**. Comma-separated email domains
       (e.g. `company.com,company.ru`); signup is refused for anything else.
       Left unset, registration stays open to whoever reaches the API, which
       is fine while the link is private and not fine once it can be
       forwarded. Existing accounts are unaffected — this only gates
       `POST /api/auth/register`.
     - `TELEGRAM_BOT_TOKEN` — optional. Enables Telegram login/registration
       and notifications; without it the feature self-disables (button
       hides client-side, endpoints 503). Get one from @BotFather.
     - `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` —
       optional, notification fallback for users with no Telegram linked.
     - `SENTRY_DSN` — optional, server-side error tracking. Get one from
       sentry.io (create a Node/Express project).
   - Settings → Volumes → add a volume mounted at `/data`.
   - Deploy. Railway builds `server/Dockerfile` and assigns a domain like
     `qa-hub-api-production.up.railway.app`.

3. **Verify the API is actually up:**
   ```bash
   curl https://<your-server-domain>/api/health
   # → {"status":"ok"}
   ```

4. **Add the `client` service.**
   - Settings → Root Directory: `client`
   - Settings → Variables (these are **build-time** args, set them before
     the first build — Vite bakes them into the JS bundle). Railway passes
     service Variables through as Docker build args automatically, but
     only for `ARG`s the Dockerfile actually declares — `client/Dockerfile`
     declares all four below, so setting them here is sufficient; if you
     ever add a new `VITE_*` var, it needs a matching `ARG`/`ENV` pair
     added to the Dockerfile too, or it silently never reaches the bundle:
     - `VITE_API_BASE_URL=https://<your-server-domain>/api`
     - `VITE_SENTRY_DSN` — optional, client-side error tracking (create a
       React project on sentry.io — separate DSN from the server's).
     - `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` — optional, product
       analytics. Get a key from posthog.com.
   - Deploy. Railway assigns a domain like
     `qa-hub-production.up.railway.app`.

5. **Close the loop:** go back to the `server` service's variables and set
   `CORS_ORIGIN=https://<your-client-domain>` (no trailing slash), then
   redeploy the server so it takes effect.

6. **Smoke test the real deployment:** open the client URL, log in with a
   seeded test account, confirm the dashboard loads. If login fails with a
   CORS error in the browser console, double check step 5's origin has no
   trailing slash and exactly matches what the browser sends.

7. **Decommission Vercel** once Railway is confirmed working — remove the
   Vercel project/integration so there's no confusion about which
   deployment is authoritative.

8. **Custom domain (optional):** Railway → service → Settings → Networking
   → Custom Domain, for either or both services, once you're ready to move
   off the `*.up.railway.app` subdomains. Needs a DNS CNAME record at
   whatever registrar you use.

## Critical operational constraint — read before touching replica counts

**The server service must never run more than 1 replica.** `better-sqlite3`
is a single-process, single-writer embedded database — a second replica
would mean two processes writing to the same SQLite file with no
coordination between them, which corrupts data. `server/railway.json`
already pins `numReplicas: 1`; leave it there unless/until the database
layer itself is migrated to something that supports concurrent writers
(e.g. Postgres) — not a change to make casually.

## Database backups

The server (`server/src/backup.js`) takes an online backup (via
better-sqlite3's `.backup()` — doesn't lock the live DB) every 6 hours into
a `backups/` subdirectory next to the live DB file, keeping the last 28
(1 week of history at that interval) and pruning older ones automatically.
No setup needed — it starts itself on boot and stops cleanly on shutdown.

**What this does and doesn't cover:** since backups live on the same
Railway volume as the live DB, this protects against logical corruption —
a bad migration, an application bug that deletes the wrong rows — and
gives an easy rollback point. It does **not**, on its own, protect against
losing the volume itself (disk failure, accidental volume deletion) — see
the off-site shipping below for that half.

### Off-site backup shipping

Set `BACKUP_S3_BUCKET`/`BACKUP_S3_ACCESS_KEY_ID`/`BACKUP_S3_SECRET_ACCESS_KEY`
(see `server/.env.example` for the full list and a Cloudflare R2 / Backblaze
B2 / AWS S3 comparison) and every local backup also gets uploaded to that
bucket right after it's written — the fix for "the whole volume, live DB
and all local backups together, is lost or corrupted at once." Unset (the
default) means no behavior change, backups stay local-only. Set a bucket
lifecycle rule (in R2/B2/S3's own dashboard) to auto-expire objects after
~30 days rather than managing remote pruning here.

Manual backup before any risky change (e.g. right before a schema
migration you're unsure about), same as before:
```bash
railway run --service server -- sqlite3 /data/learning_hub.db ".backup /data/backup-$(date +%Y%m%d).db"
```

### Restoring from a backup

Backups existing is not the same as being able to restore from one under
pressure — this has never actually been exercised end-to-end, so treat it
as a starting runbook to verify (ideally on a throwaway volume first), not
a guarantee.

1. **List what's available:**
   ```bash
   railway run --service server -- ls -la /data/backups
   ```
2. **Scale the server service to 0 replicas first** (Railway dashboard →
   server service → Settings → a running app writing to the DB at the same
   moment a restore happens underneath it is how you turn one bad table
   into two).
3. **Restore the chosen backup over the live DB**, via sqlite3's own
   `.restore` (the inverse of the `.backup` command already used above —
   goes through SQLite's backup API rather than a raw file copy, so it
   can't leave the live DB half-written):
   ```bash
   railway run --service server -- sqlite3 /data/learning_hub.db ".restore /data/backups/<chosen-backup-file>.db"
   ```
4. **Clear any stale WAL/SHM sidecars** left over from the *pre-restore*
   live DB — otherwise they can get replayed against the just-restored
   file, silently reintroducing exactly what the restore was meant to undo:
   ```bash
   railway run --service server -- sh -c 'rm -f /data/learning_hub.db-wal /data/learning_hub.db-shm'
   ```
5. **Scale the server back to 1 replica.** Confirm with
   `curl https://<server-domain>/api/health` and a real login before
   telling anyone it's back.

## Go-live checklist

Everything here is a variable to set or a thing to do once, not code to
write. The code side is done; these are the parts only the operator can do,
listed in the order they bite.

1. **`BACKUP_S3_*`** — until these are set, every backup lives on the same
   volume as the database it is a backup of. That protects against a
   dropped table and against nothing else. The server logs a warning on
   every production start while this is unset; see "Off-site backup
   shipping" above for the R2/B2 values.
2. **Restore drill** — run `npm run backups` to list what exists, then
   restore the newest one onto a scratch copy and log in. The mechanics are
   covered by tests (`server/test/backup-restore.test.js`), but a drill
   proves the backups on *this* volume are real, which no test can.
3. **The two origins.** Client and server are separate Railway services
   with separate hostnames, so each has to be told about the other, and
   both failures show up only in the browser console:
   - `VITE_API_BASE_URL` on the **client** — the API's URL. The CSP's
     `connect-src` is derived from it when the image is built (see
     `client/Dockerfile`), so the policy and the bundle cannot disagree
     and there is no second variable to keep in step. A relative `/api`
     yields `connect-src 'self'`, which is right for a reverse proxy
     serving both under one hostname. Pass `API_ORIGIN` as a build arg
     only if the browser must reach an origin the base URL does not name.
   - `CORS_ORIGIN` on the **server** — the client's URL, no trailing
     slash. Without it the API refuses the browser's requests even once
     the CSP allows them.

4. **`ADMIN_EMAIL` / `ADMIN_PASSWORD`** — the first account on an empty
   database. Without them a fresh deployment starts with no users and no
   way in. Change the password after the first login.
5. **`SENTRY_DSN`** — errors print to the container log without it, which
   means nobody sees them.
6. **Notification channel** — `TELEGRAM_BOT_TOKEN` or the four `SMTP_*`
   values. With neither, security alerts and every other notification
   silently do nothing; the server warns about this at startup too.

## Still open

- Object storage for avatars (base64-in-DB is an accepted trade-off for
  now, per earlier product decision)
- Custom domain / DNS, if wanted beyond the Railway-provided subdomains
- Single node by design — see the replica-count constraint above. SQLite
  is the reason, and the reason is deliberate.

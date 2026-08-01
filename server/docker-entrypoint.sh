#!/bin/sh
set -e

# Railway's persistent volume is mounted onto /data *after* the image is
# built, so any chown/chmod baked into a Dockerfile RUN layer only ever
# applies to the empty placeholder directory that existed at build time —
# never to the real volume. This volume was first provisioned back when the
# container ran as root, so its files are root-owned; once the container
# switched to running as the unprivileged "node" user, every deploy started
# crashing at boot with SQLITE_READONLY_DIRECTORY because "node" couldn't
# write to it. Fixing ownership here, at container start, is the only point
# that actually touches the real mounted volume — and it self-heals no
# matter who owns it, so this survives volume recreation too.
#
# Skipped once already correct — /data accumulates the live DB plus up to 28
# rotating backups, and walking all of it on every restart (including every
# crash-loop retry) would add needless startup latency as it grows.
owner="$(stat -c '%u:%g' /data 2>/dev/null || echo '')"
if [ "$owner" != "1000:1000" ]; then
  chown -R node:node /data
fi

# `su` (tried first) does not forward signals to the process it starts —
# Railway sends SIGTERM on every deploy/restart, and su silently swallowed
# it, so the graceful-shutdown handler in src/index.js (closes the DB and
# in-flight requests cleanly) never ran; the container was hard-killed every
# single time instead. setpriv execs the target command in place of itself —
# no wrapper process left around to eat the signal — and ships as part of
# util-linux, which is on every Debian base image including this one, so it
# needs no extra install. uid/gid 1000 is the "node" account baked into the
# official node:20 image.
if ! command -v setpriv >/dev/null 2>&1; then
  echo "docker-entrypoint: setpriv not found — refusing to fall back to su, which silently drops shutdown signals" >&2
  exit 1
fi

exec setpriv --reuid=1000 --regid=1000 --init-groups -- "$@"

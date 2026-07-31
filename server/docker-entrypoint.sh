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
chown -R node:node /data

exec su -s /bin/sh node -c "exec $*"

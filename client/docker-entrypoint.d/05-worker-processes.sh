#!/bin/sh
# Caps nginx's worker count.
#
# The image ships `worker_processes auto`, which means one worker per host
# CPU. On Railway's shared metal that came out as 48 workers — for a
# container that serves a few hundred kilobytes of static files, in one
# replica, behind a platform proxy. The image's own 30-tune-worker-processes
# script exists for exactly this, but it derives the number from the cgroup
# CPU quota, and there is evidently none to read here: the log showed `auto`
# winning anyway.
#
# Each worker costs a few megabytes of private memory plus its connection
# buffers. Two is ample for static files; NGINX_WORKER_PROCESSES raises it
# if this ever fronts something heavier.
set -e

CONF="${NGINX_MAIN_CONF:-/etc/nginx/nginx.conf}"
workers="${NGINX_WORKER_PROCESSES:-2}"

# Written through a temp file rather than `sed -i`, which needs a backup
# suffix on BSD and refuses one on busybox — the in-place form is the one
# shape of this line that cannot be run outside the container it ships in,
# which is where the test lives.
sed "s/^worker_processes .*/worker_processes ${workers};/" "$CONF" > "$CONF.new"
mv "$CONF.new" "$CONF"

echo "nginx worker_processes: ${workers}"

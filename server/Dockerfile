FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# The DB lives in its own directory, separate from application code
# (server/db/*.js). A persistent volume gets mounted here — mounting a
# volume onto a directory replaces that directory's contents entirely,
# so if this were /app/db instead, mounting the volume would shadow and
# hide schema.js/seed.js, crashing the app with ERR_MODULE_NOT_FOUND on
# every boot. See docker-compose.yml, which mounts a volume here too.
RUN mkdir -p /data

# Fixes /data's ownership at container *start* (see docker-entrypoint.sh) and
# only then drops to the non-root "node" user to actually run the app —
# defense-in-depth, a bug or dependency vulnerability that lets an attacker
# execute code runs as a normal user, not the container's root. A plain
# `USER node` here was tried before and reliably crashed the app in
# production: Railway mounts the persistent volume onto /data *after* the
# image is built, so it never sees this layer's ownership at all, only
# whatever it was provisioned with (root, from before this hardening
# existed) — hence the entrypoint script instead of a build-time USER.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# This image exists to be deployed; nothing else builds it. Leaving
# NODE_ENV unset made `docker compose up` refuse to start on a fresh
# volume — app.js declines to seed demo accounts into what looks like a
# real deployment, and an unset NODE_ENV is exactly what that guard treats
# as "nobody decided". Setting it here means the guard protects real
# deployments without blocking the one documented way to stand this up.
ENV NODE_ENV=production
ENV PORT=5001
ENV DB_PATH=/data/learning_hub.db
EXPOSE 5001

# Container-native health signal, so an orchestrator restarts a process
# that is up but broken rather than only one that has exited. Points at
# the endpoint that actually writes to the database (see app.js) — a check
# that only proves the event loop is turning would report healthy through
# a read-only disk.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

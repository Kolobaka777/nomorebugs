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

ENV PORT=5001
ENV DB_PATH=/data/learning_hub.db
EXPOSE 5001

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

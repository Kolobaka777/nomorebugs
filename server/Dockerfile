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
#
# chmod 777 (not just chown) because Railway's own volume provisioning is
# out of our control — if it mounts an empty volume here owned by a
# different uid than "node" below, a plain chown baked into this layer
# won't apply to it at runtime. World-writable is broader than ideal, but
# this directory holds nothing but our own SQLite file, in a
# single-process container with no other tenants — the realistic exposure
# is low. Ownership is still narrowed with chown for the image's own layer.
RUN mkdir -p /data && chown node:node /data && chmod 777 /data

# Runs as the image's built-in non-root "node" user (uid 1000) instead of
# root — defense-in-depth: a bug or dependency vulnerability that lets an
# attacker execute code is a normal user, not the container's root. Ship
# this deploy on its own, separate from other changes, and be ready to
# redeploy the previous image (Railway keeps it) if the container fails to
# boot — the one thing this can't be verified against locally is whatever
# uid actually owns the already-provisioned production /data volume.
USER node

ENV PORT=5001
ENV DB_PATH=/data/learning_hub.db
EXPOSE 5001

CMD ["node", "src/index.js"]

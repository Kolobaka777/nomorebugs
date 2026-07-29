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

ENV PORT=5001
ENV DB_PATH=/data/learning_hub.db
EXPOSE 5001

CMD ["node", "src/index.js"]

FROM node:20-alpine

# better-sqlite3 is a native module — if no prebuilt binary matches this
# platform, npm falls back to compiling from source, which needs these.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Persisted outside the image so the database survives a redeploy — see
# docker-compose.yml, which mounts a volume here.
VOLUME /app/db

ENV PORT=5001
ENV DB_PATH=/app/db/learning_hub.db
EXPOSE 5001

CMD ["node", "src/index.js"]

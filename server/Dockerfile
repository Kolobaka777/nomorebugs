FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Persisted outside the image so the database survives a redeploy — see
# docker-compose.yml, which mounts a volume here.

ENV PORT=5001
ENV DB_PATH=/app/db/learning_hub.db
EXPOSE 5001

CMD ["node", "src/index.js"]

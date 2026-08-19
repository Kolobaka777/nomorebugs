# Vite bakes these into the built JS at build time (not runtime) — every
# hosting platform (Railway included) must pass them as build args, not
# just service-level environment variables, or the build silently ships
# without them and the corresponding feature stays permanently disabled.
#   docker build --build-arg VITE_API_BASE_URL=https://api.example.com/api -t baga-net-client .
# VITE_API_BASE_URL: backend origin, reachable from a user's browser.
# Defaults to same-origin /api, which only works if the server is
# reverse-proxied under the same domain as this client.
# VITE_SENTRY_DSN / VITE_POSTHOG_KEY / VITE_POSTHOG_HOST: optional
# monitoring — see client/.env.example. Left empty, both integrations
# simply don't activate (see client/src/monitoring.ts).
ARG VITE_API_BASE_URL=/api
ARG VITE_SENTRY_DSN=
ARG VITE_POSTHOG_KEY=
ARG VITE_POSTHOG_HOST=https://us.i.posthog.com

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ARG VITE_SENTRY_DSN
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_POSTHOG_KEY=${VITE_POSTHOG_KEY}
ENV VITE_POSTHOG_HOST=${VITE_POSTHOG_HOST}
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# The official nginx image auto-renders any *.template file in this
# directory through envsubst on container start, substituting ${PORT}
# into the real config. Needed because most container platforms
# (Railway, Render, Fly) assign the listen port at runtime rather than
# letting the image hardcode it — a plain `listen 80` would silently
# not be reachable on those platforms.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
# Substituted into the CSP's connect-src at container start. Derived from
# the same value the JS bundle was built against, so the policy and the
# code agree by construction; empty when the API is same-origin, which
# leaves connect-src at 'self'.
# Sane default for `docker run`/docker-compose, where nothing injects
# PORT — real deployments override this with their assigned port.
ENV PORT=80
ENV API_ORIGIN=
EXPOSE 80

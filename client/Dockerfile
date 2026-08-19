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
#
# Docker's linter flags VITE_POSTHOG_KEY as a secret in an ARG. It is not
# one: a PostHog project key and a Sentry DSN are both public by design —
# they are compiled into JavaScript that every visitor downloads, so
# hiding them from the build would hide them from nobody. Anything that
# actually needs to stay secret never goes near this image; it lives on
# the server service, which the browser cannot read.
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

# The CSP's connect-src, filled in here rather than left to the operator.
#
# It used to be an empty runtime variable with a comment claiming it was
# derived from the API URL. Nothing derived it, so a deployment whose API
# lives on a second domain — which is the documented Railway layout, two
# services, two hostnames — shipped a policy that blocked every request the
# app makes, and said so only in the browser console.
#
# Derived now, from the same VITE_API_BASE_URL the bundle was compiled
# against, so the policy and the code cannot disagree and there is no
# second variable to keep in step. Build-time is the right time: Vite bakes
# the API URL into the JavaScript at build too, so a runtime override could
# only ever contradict what the bundle already does.
#
# A relative VITE_API_BASE_URL (the `/api` default, for a reverse proxy
# serving both under one hostname) yields nothing, leaving connect-src at
# 'self' — correct for that layout.
#
# API_ORIGIN is accepted too, for the rare case where the browser must
# reach an origin the bundle's base URL does not name.
#
# Recorded to a file rather than substituted into the template outright:
# doing it only here assumes the build is given the variable, and on
# Railway it was not — the bundle had the URL, the derived origin came out
# empty, and the CSP shipped blocking every call the app makes. The
# entrypoint script derives it again at container start and falls back to
# this file, so the config is right whichever moment the platform hands the
# value over.
ARG VITE_API_BASE_URL
ARG API_ORIGIN
RUN printf '%s' "${API_ORIGIN:-$(printf '%s' "$VITE_API_BASE_URL" | sed -n 's#^\(https\{0,1\}://[^/]*\).*#\1#p')}" > /etc/nginx/csp-origin \
 && echo "CSP connect-src baked at build: '$(cat /etc/nginx/csp-origin)'"

COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-worker-processes.sh /docker-entrypoint.d/10-csp-origin.sh

# Sane default for `docker run`/docker-compose, where nothing injects
# PORT — real deployments override this with their assigned port.
ENV PORT=80
EXPOSE 80

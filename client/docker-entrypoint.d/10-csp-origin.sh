#!/bin/sh
# Fills ${API_ORIGIN} in the nginx template with the origin the browser is
# allowed to call, and runs before nginx's own 20-envsubst-on-templates.sh
# (the image executes /docker-entrypoint.d/* in sorted order, so the number
# is what puts it first).
#
# Why this is not simply done at build time: it was, and it did not work.
# The value has to come from VITE_API_BASE_URL, and whether a platform
# exposes a variable to the *build* or only to the *running container* is
# the platform's business, not ours. Railway's client service had the URL —
# the bundle is compiled with it — and the derived origin still came out
# empty, so the CSP shipped as `connect-src 'self'` and blocked every call
# the app makes.
#
# Deriving it here as well means the config is correct whichever of the two
# a platform provides, without asking anyone to keep a second variable in
# step with the first.
set -e

# Overridable so the script can be run against fixtures by a test, rather
# than having a copy of its logic restated in one.
TEMPLATE="${CSP_TEMPLATE:-/etc/nginx/templates/default.conf.template}"
BAKED="${CSP_BAKED:-/etc/nginx/csp-origin}"

origin="${API_ORIGIN}"
if [ -z "$origin" ] && [ -n "$VITE_API_BASE_URL" ]; then
  origin=$(printf '%s' "$VITE_API_BASE_URL" | sed -n 's#^\(https\{0,1\}://[^/]*\).*#\1#p')
fi
# Baked in at build, when the build did have the value.
if [ -z "$origin" ] && [ -s "$BAKED" ]; then
  origin=$(cat "$BAKED")
fi

# A relative base URL (one hostname, a reverse proxy in front of both)
# leaves this empty, and `connect-src 'self'` is right for that layout.
echo "CSP connect-src: 'self' ${origin:-(same-origin only)}"

export API_ORIGIN="$origin"

# Written through a temp file rather than `sed -i`: in-place editing needs a
# backup-suffix argument on BSD sed and refuses one on GNU/busybox, so the
# in-place form is the one shape of this line that cannot be run outside the
# container it ships in — which is where the test lives.
sed "s|\${API_ORIGIN}|${origin}|g" "$TEMPLATE" > "$TEMPLATE.new"
mv "$TEMPLATE.new" "$TEMPLATE"

# Refuse to hand nginx a config it would reject at startup. Matched as a
# fixed string against the placeholder itself — the template also mentions
# API_ORIGIN by name in a comment, and a looser pattern matched that and
# failed every start.
if grep -qF '${API_ORIGIN}' "$TEMPLATE"; then
  echo "CSP placeholder was not substituted in $TEMPLATE" >&2
  exit 1
fi

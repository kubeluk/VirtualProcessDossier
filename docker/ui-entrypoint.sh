#!/bin/sh
set -eu

# Only nginx receives the Fuseki credential; it is never part of the SPA bundle.
FUSEKI_AUTH="$(printf '%s' "admin:${ADMIN_PASSWORD:-admin}" | base64 | tr -d '\n')"
export FUSEKI_AUTH
exec /docker-entrypoint.sh "$@"

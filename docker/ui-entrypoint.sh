#!/bin/sh
set -eu

: "${FUSEKI_PROXY_TARGET:?Set FUSEKI_PROXY_TARGET to the Fuseki base URL}"
: "${FUSEKI_DATASET:?Set FUSEKI_DATASET to the existing dataset name}"

# Values enter an nginx template, so reject configuration syntax and URL credentials.
while [ "${FUSEKI_PROXY_TARGET%/}" != "$FUSEKI_PROXY_TARGET" ]; do
    FUSEKI_PROXY_TARGET=${FUSEKI_PROXY_TARGET%/}
done
case "$FUSEKI_PROXY_TARGET" in
    *[[:space:]]*) echo 'FUSEKI_PROXY_TARGET must not contain whitespace.' >&2; exit 1 ;;
esac
if ! printf '%s\n' "$FUSEKI_PROXY_TARGET" | grep -Eq '^https?://(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9._-]+)(:[0-9]{1,5})?(/[a-zA-Z0-9._~%/-]*)?$'; then
    echo 'FUSEKI_PROXY_TARGET must be an HTTP(S) base URL without credentials or a query.' >&2
    exit 1
fi
case "$FUSEKI_DATASET" in
    *[!a-zA-Z0-9_-]*) echo 'Invalid FUSEKI_DATASET name.' >&2; exit 1 ;;
esac

# Only nginx receives the credential. Empty credentials explicitly disable authentication.
FUSEKI_AUTHORIZATION=''
if [ -n "${FUSEKI_USERNAME:-}" ] || [ -n "${FUSEKI_PASSWORD:-}" ]; then
    if [ -z "${FUSEKI_USERNAME:-}" ] || [ -z "${FUSEKI_PASSWORD:-}" ]; then
        echo 'Set both FUSEKI_USERNAME and FUSEKI_PASSWORD, or leave both empty.' >&2
        exit 1
    fi
    case "$FUSEKI_USERNAME" in
        *:*) echo 'FUSEKI_USERNAME must not contain a colon.' >&2; exit 1 ;;
    esac
    FUSEKI_AUTHORIZATION="Basic $(printf '%s' "$FUSEKI_USERNAME:$FUSEKI_PASSWORD" | base64 | tr -d '\n')"
fi
export FUSEKI_PROXY_TARGET FUSEKI_DATASET FUSEKI_AUTHORIZATION
NGINX_ENVSUBST_FILTER='^(FUSEKI_PROXY_TARGET|FUSEKI_DATASET|FUSEKI_AUTHORIZATION)$'
export NGINX_ENVSUBST_FILTER
exec /docker-entrypoint.sh "$@"

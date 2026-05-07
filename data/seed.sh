#!/bin/sh
set -e

FUSEKI="http://jena:3030"

echo "Waiting for Jena Fuseki..."
until curl -sf -u admin:${ADMIN_PASSWORD} "${FUSEKI}/$/ping" > /dev/null; do
  sleep 2
done
echo "Jena is up."

# ── vpd dataset ────────────────────────────────────────────────────────────────

VPD_DATASET="vpd"
VPD_TTL="/data/catalog.ttl"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASSWORD} "${FUSEKI}/${VPD_DATASET}")
if [ "$STATUS" = "404" ]; then
  echo "Creating dataset '${VPD_DATASET}'..."
  curl -sf -u admin:${ADMIN_PASSWORD} \
    -X POST "${FUSEKI}/$/datasets" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "dbName=${VPD_DATASET}&dbType=tdb2"
  echo "Dataset '${VPD_DATASET}' created."
else
  echo "Dataset '${VPD_DATASET}' already exists."
fi

COUNT=$(curl -sf -G "${FUSEKI}/${VPD_DATASET}/sparql" \
  --data-urlencode "query=SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }" \
  -H "Accept: application/sparql-results+json" \
  | tr -d ' \t' | grep -o '"value":"[0-9]*"' | grep -o '[0-9]*' || echo "0")

if [ "${COUNT}" = "0" ]; then
  echo "Loading seed data into '${VPD_DATASET}'..."
  for ttl in /data/catalog.ttl /data/parameter-shapes.ttl; do
    if [ -f "${ttl}" ]; then
      echo "  Loading ${ttl}..."
      curl -sf -u admin:${ADMIN_PASSWORD} \
        -X POST "${FUSEKI}/${VPD_DATASET}/data?default" \
        -H "Content-Type: text/turtle" \
        --data-binary @"${ttl}"
    fi
  done
  echo "Seed data loaded into '${VPD_DATASET}'."
else
  echo "Dataset '${VPD_DATASET}' already contains ${COUNT} triples, skipping seed."
fi

# ── qudt dataset (static — never modified by the UI) ──────────────────────────

QUDT_DATASET="qudt"
QUDT_FILES="/data/unit.ttl /data/quantitykind.ttl"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASSWORD} "${FUSEKI}/${QUDT_DATASET}")
if [ "$STATUS" = "404" ]; then
  echo "Creating dataset '${QUDT_DATASET}'..."
  curl -sf -u admin:${ADMIN_PASSWORD} \
    -X POST "${FUSEKI}/$/datasets" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "dbName=${QUDT_DATASET}&dbType=tdb2"
  echo "Dataset '${QUDT_DATASET}' created."
else
  echo "Dataset '${QUDT_DATASET}' already exists."
fi

COUNT=$(curl -sf -G "${FUSEKI}/${QUDT_DATASET}/sparql" \
  --data-urlencode "query=SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }" \
  -H "Accept: application/sparql-results+json" \
  | tr -d ' \t' | grep -o '"value":"[0-9]*"' | grep -o '[0-9]*' || echo "0")

if [ "${COUNT}" = "0" ]; then
  echo "Loading seed data into '${QUDT_DATASET}'..."
  for TTL in ${QUDT_FILES}; do
    curl -sf -u admin:${ADMIN_PASSWORD} \
      -X POST "${FUSEKI}/${QUDT_DATASET}/data?default" \
      -H "Content-Type: text/turtle" \
      --data-binary @"${TTL}"
    echo "Loaded ${TTL} into '${QUDT_DATASET}'."
  done
else
  echo "Dataset '${QUDT_DATASET}' already contains ${COUNT} triples, skipping seed."
fi

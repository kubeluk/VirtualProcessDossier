#!/bin/sh
set -e

FUSEKI="http://jena:3030"
DATASET="vpd"
TTL="/data/catalog.ttl"

echo "Waiting for Jena Fuseki..."
until curl -sf -u admin:${ADMIN_PASSWORD} "${FUSEKI}/$/ping" > /dev/null; do
  sleep 2
done
echo "Jena is up."

# Create dataset if it doesn't exist
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -u admin:${ADMIN_PASSWORD} "${FUSEKI}/${DATASET}")
if [ "$STATUS" = "404" ]; then
  echo "Creating dataset '${DATASET}'..."
  curl -sf -u admin:${ADMIN_PASSWORD} \
    -X POST "${FUSEKI}/$/datasets" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "dbName=${DATASET}&dbType=tdb2"
  echo "Dataset created."
else
  echo "Dataset '${DATASET}' already exists."
fi

# Seed data only if the default graph is empty
COUNT=$(curl -sf -G "${FUSEKI}/${DATASET}/sparql" \
  --data-urlencode "query=SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }" \
  -H "Accept: application/sparql-results+json" \
  | tr -d ' \t' | grep -o '"value":"[0-9]*"' | grep -o '[0-9]*' || echo "0")

if [ "${COUNT}" = "0" ]; then
  echo "Loading seed data..."
  curl -sf -u admin:${ADMIN_PASSWORD} \
    -X POST "${FUSEKI}/${DATASET}/data?default" \
    -H "Content-Type: text/turtle" \
    --data-binary @"${TTL}"
  echo "Seed data loaded."
else
  echo "Dataset already contains ${COUNT} triples, skipping seed."
fi

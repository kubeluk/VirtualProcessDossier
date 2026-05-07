# Virtual Process Dossier (VPD)

A web application that lets non-expert users browse, document, and trace manufacturing process data stored in a Knowledge Graph. It abstracts RDF/SPARQL complexity behind a clean UI backed by [Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/).

## What it does

- **Data Catalog** — browse datasets produced by manufacturing steps; filter by keyword, workflow run, or workflow model
- **Workflow Models** — define reusable process templates as hierarchical step trees (sequential / parallel) using the [WiLD](http://purl.org/wild/vocab) ontology
- **Workflow Runs** — register executions of a model; track activity state; attach observation datasets to individual steps
- **Activity Library** — maintain a library of reusable atomic activities with linked systems and inputs
- **System Library** — manage machine/station hierarchies (`ssn:System`, `sosa:Sensor`, `sosa:Actuator`) with arbitrary sub-system nesting

All data is stored as RDF (Turtle) in Fuseki and queried via SPARQL. Ontologies used: [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/), [SOSA/SSN](https://www.w3.org/TR/vocab-ssn/), [PROV-O](https://www.w3.org/TR/prov-o/), [WiLD](http://purl.org/wild/vocab), [QUDT](https://qudt.org/).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose — for the recommended setup
- [Node.js](https://nodejs.org/) 18+ and npm — only needed for local development

## Quick start (Docker)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| VPD UI | http://localhost:8080 |
| Jena Fuseki admin | http://localhost:3030 (admin / admin) |

The `seed` service automatically creates two Fuseki datasets and loads sample data on first start:

- **`vpd`** — application data seeded from `data/catalog.ttl`
- **`qudt`** — static QUDT units and quantity kinds (read-only)

Seeding is skipped on subsequent starts if data already exists. To reset to a clean state:

```bash
docker compose down -v   # removes the jena-data volume
docker compose up --build
```

## Local development

```bash
npm install
npm run dev   # http://localhost:5173
```

The Vite dev server proxies `/sparql` and `/update` to `http://localhost:3030`. Fuseki must be running separately — the easiest way is to start only the backend services:

```bash
docker compose up jena seed
```

### Environment variables

Copy `.env.example` to `.env` and adjust if your Fuseki runs elsewhere:

```
VITE_SPARQL_ENDPOINT=http://localhost:3030/vpd/sparql
VITE_SPARQL_UPDATE_ENDPOINT=http://localhost:3030/vpd/update
```

### Other commands

```bash
npm run build   # type-check + production build
npm run lint    # ESLint with auto-fix
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 (Composition API), TypeScript, Vite |
| State | Pinia |
| Routing | Vue Router |
| HTTP | Axios |
| Backend | Apache Jena Fuseki 5.1 |
| Container | Docker Compose (nginx + Fuseki + curl seed) |

## Project structure

```
src/
  services/    # SPARQL query/update helpers
  stores/      # Pinia stores (catalog, workflow, graph config)
  components/  # Reusable modals and recursive tree nodes
  views/       # One view per route
data/
  catalog.ttl       # Sample DCAT dataset seed
  unit.ttl          # QUDT unit definitions
  quantitykind.ttl  # QUDT quantity-kind definitions
  seed.sh           # Init script run by the seed service
```

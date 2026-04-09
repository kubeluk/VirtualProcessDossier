# VPD-UI

A Vue.js SPA for non-expert users to interact with a Knowledge Graph stored in an Apache Jena Fuseki triple store.

## Tech Stack

- **Vue 3** — Composition API, `<script setup>` SFCs
- **TypeScript** — strict mode throughout
- **Vite** — build tool; dev proxy routes `/sparql` → `localhost:3030`
- **Pinia** — state management (`src/stores/`)
- **Vue Router** — SPA routing (`src/router/`)
- **Axios** — HTTP client for SPARQL communication
- **ESLint + Prettier** — single quotes, no semicolons, 100-char line width

## Project Structure

```
src/
  assets/        # Global CSS
  router/        # Vue Router config
  services/      # SPARQL query/update helpers (sparql.ts)
  stores/
    graph.ts     # SPARQL endpoint config (endpoint ref, defaults to /sparql)
    catalog.ts   # Dataset list + detail fetching (fetchDatasets, fetchDataset)
  views/
    HomeView.vue    # Landing page → links to /catalog
    CatalogView.vue # Browse all datasets (card list)
    DatasetView.vue # Dataset detail; route: /dataset?uri=<encoded-uri>
data/
  catalog.ttl    # DCAT seed data (loaded automatically on first Docker start)
  seed.sh        # Init script run by the 'seed' Docker service
```

## Routes

| Path | Name | View | Description |
|------|------|------|-------------|
| `/` | `home` | HomeView | Landing page |
| `/catalog` | `catalog` | CatalogView | Browse all datasets |
| `/dataset?uri=` | `dataset` | DatasetView | Dataset detail (uri = full encoded dataset URI) |

## Commands

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Type-check + production build
npm run lint     # ESLint with auto-fix
```

## Docker

```bash
docker compose up --build        # UI on :8080, Jena Fuseki on :3030
docker compose down -v           # Tear down including data volume (resets seed)
```

- The `seed` service auto-creates the `vpd` dataset and loads `data/catalog.ttl` on first start.
- Seeding is skipped on subsequent starts if the graph already contains triples.
- Fuseki admin UI: `http://localhost:3030` (credentials: `admin` / `admin`)

## SPARQL / Jena

- Dev proxy: `/sparql` → `http://localhost:3030/vpd/sparql`
- Update endpoint: `/update` → `http://localhost:3030/vpd/update`
- Endpoint URL configurable via `VITE_SPARQL_ENDPOINT` in `.env`
- Base service layer: `src/services/sparql.ts` — `querySparql()` and `updateSparql()`

## Knowledge Graph / RDF Conventions

- **Ontology**: [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) for the data catalog structure
- **DCAT namespace**: `http://www.w3.org/ns/dcat#` (http, not https — as declared in dcat3.ttl)
- **Resource URIs**: Hash URIs under a single base — `https://example.org/vpd#<resource>`
  - e.g. `vpd:catalog`, `vpd:dataset-air-quality`, `vpd:dist-air-quality-csv`
  - Rationale: all catalog resources belong to one document; hash URIs are appropriate per the [Cool URIs](https://www.w3.org/TR/cooluris/#hashuri) recommendation
- **Supporting vocabularies**: `dcterms`, `foaf`, `xsd`, `prov`, `sosa`, `ssn`, `geo`
- Ontologies for new features are provided incrementally and documented here as they are added

### Provenance (seeded)
- Each `dcat:Dataset` is linked to exactly one `sosa:Observation` via `prov:wasGeneratedBy`; the observation also carries `sosa:hasResult <dataset>` — making the dataset the result of the observation
- Each `sosa:Observation` is also typed `prov:Activity` to satisfy PROV-O semantics; it carries `prov:startedAtTime` / `prov:endedAtTime`
- A `sosa:Observation` may have **at most one** `sosa:madeBySensor`, `sosa:hasFeatureOfInterest`, and `sosa:observedProperty` — none are required
- Sensors (`sosa:Sensor`) use `sosa:observes` to link to their observable property
- Features of interest (`sosa:FeatureOfInterest`) use `ssn:hasProperty` to link to their property
- Observable properties are typed `sosa:ObservableProperty`
- Verified namespaces (dereferenced from W3C specs): `prov: <http://www.w3.org/ns/prov#>`, `sosa: <http://www.w3.org/ns/sosa/>`, `ssn: <http://www.w3.org/ns/ssn/>`
- Confirmed valid terms — SOSA: `Observation`, `Sensor`, `FeatureOfInterest`, `ObservableProperty`, `madeBySensor`, `hasFeatureOfInterest`, `observedProperty`, `hasResult`, `hasSimpleResult`, `resultTime`, `phenomenonTime`, `observes` — SSN: `hasProperty`, `Property` — PROV: `Activity`, `wasGeneratedBy`, `startedAtTime`, `endedAtTime`
- `sosa:ObservationCollection` and `ssn:observes` do **not** exist in the standards — do not use them

## Domain Context

This UI abstracts RDF/SPARQL complexity from end users. Features are built around specific ontologies provided incrementally. All SPARQL is generated in the service layer — never exposed raw to users.

## Features

### Data Catalog Browse (implemented)
- Dataset list at `/catalog`: queries all `dcat:Dataset` resources linked via `dcat:Catalog`, shows title, description, modified date, distribution count
- Dataset detail at `/dataset?uri=<encoded-uri>`: shows full metadata (keywords, modified) and all distributions with format, file size, and download link
- SPARQL queries live in `src/stores/catalog.ts`; views are purely presentational

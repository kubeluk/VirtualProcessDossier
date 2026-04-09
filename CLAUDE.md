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
  stores/        # Pinia stores
  views/         # Page-level components
```

## Commands

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Type-check + production build
npm run lint     # ESLint with auto-fix
```

## Docker

```bash
docker compose up --build   # UI on :8080, Jena Fuseki on :3030
```

Create the `vpd` dataset in Fuseki admin UI before running queries.

## SPARQL / Jena

- Dev proxy: `/sparql` → `http://localhost:3030/vpd/sparql`
- Update endpoint: `/update` → `http://localhost:3030/vpd/update`
- Endpoint URL configurable via `VITE_SPARQL_ENDPOINT` in `.env`
- Base service layer: `src/services/sparql.ts` — `querySparql()` and `updateSparql()`

## Domain Context

This UI abstracts RDF/SPARQL complexity from end users. Features are built around specific ontologies provided incrementally. All SPARQL is generated server-side in the service layer — never exposed raw to users.

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
    catalog.ts   # Dataset list + detail fetching/adding (fetchDatasets, fetchDataset, addDataset)
    workflow.ts  # Workflow model + run queries and mutations
  components/
    AddDatasetModal.vue    # Modal for adding a new dataset to a run step
    AddWorkflowModal.vue   # Modal for creating a workflow model or editing its metadata/structure
  views/
    HomeView.vue         # Landing page → links to /catalog
    CatalogView.vue      # Browse all datasets (card list)
    DatasetView.vue      # Dataset detail; route: /dataset?uri=<encoded-uri>
    WorkflowListView.vue # Browse all workflow models; create new workflow
    WorkflowView.vue     # Workflow model detail: step skeleton + runs list + edit button
    RunView.vue          # Workflow run detail: editable header, step timeline, datasets
data/
  catalog.ttl    # DCAT seed data (loaded automatically on first Docker start)
  seed.sh        # Init script run by the 'seed' Docker service
```

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
- **Supporting vocabularies**: `dcterms`, `foaf`, `xsd`, `prov`, `sosa`, `ssn`, `geo`, `wild`
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

### Workflow (seeded)
- **Ontology**: [WiLD](http://purl.org/wild/vocab) — Workflows in Linked Data; `wild: <http://purl.org/wild/vocab#>`
- The manufacturing workflow is described at two levels:
  - **`wild:WorkflowModel`** (`vpd:workflow-manufacturing-line`) — static structure; defines the expected activities and their order/composition
  - **`wild:WorkflowInstance`** (`vpd:wfinst-manufacturing-line`) — runtime execution; groups the completed activity instances
- **Workflow model tree** — root behaviour is a `wild:SequentialActivity` whose `wild:hasChildActivities` (RDF list) encodes step order:
  - Step 1: `vpd:step-material-preparation` — `wild:AtomicActivity`
  - Step 2: `vpd:step-cnc-machining` — `wild:ParallelActivity` with two child `wild:AtomicActivity` nodes (`vpd:wfact-cnc-temperature`, `vpd:wfact-cnc-vibration`)
  - Step 3: `vpd:step-hydraulic-forming` — `wild:AtomicActivity`
  - Step 4: `vpd:step-quality-dispatch` — `wild:AtomicActivity` (no observation dataset)
- Each `sosa:Observation` is also typed `wild:ActivityInstance` and carries:
  - `wild:activityInstanceOf` → the corresponding leaf `wild:Activity` in the model
  - `wild:inWorkflowInstance` → `vpd:wfinst-manufacturing-line`
  - `wild:hasState wild:done` — semantically equivalent to `prov:Activity` (completed)
- `wild:WorkflowInstance` state is `wild:active` while any step lacks a completed activity instance
- Dataset-to-step context is also expressed directly via `dcterms:isPartOf` on each `dcat:Dataset` (pointing to the relevant step or the workflow model for cross-cutting datasets)
- Confirmed valid WiLD terms: `WorkflowModel`, `WorkflowInstance`, `ActivityInstance`, `SequentialActivity`, `ParallelActivity`, `AtomicActivity`, `hasBehaviour`, `hasChildActivities`, `workflowInstanceOf`, `activityInstanceOf`, `inWorkflowInstance`, `hasState`, `done`, `active`

## Domain Context

This UI abstracts RDF/SPARQL complexity from end users. Features are built around specific ontologies provided incrementally. All SPARQL is generated in the service layer — never exposed raw to users.

## Routes

| Path | Name | View | Description |
|------|------|------|-------------|
| `/` | `home` | HomeView | Landing page |
| `/catalog` | `catalog` | CatalogView | Browse all datasets |
| `/dataset?uri=` | `dataset` | DatasetView | Dataset detail (uri = full encoded dataset URI) |
| `/workflows` | `workflows` | WorkflowListView | Browse all workflow models |
| `/workflow?uri=` | `workflow` | WorkflowView | Workflow model detail: step skeleton + list of runs (uri = WorkflowModel URI) |
| `/run?uri=` | `run` | RunView | Workflow run detail: editable header, step timeline with activity instances + datasets (uri = WorkflowInstance URI) |

## Features

### Data Catalog Browse (implemented)
- Dataset list at `/catalog`: queries all `dcat:Dataset` resources linked via `dcat:Catalog`, shows title, description, modified date, distribution count
- Dataset detail at `/dataset?uri=<encoded-uri>`: shows full metadata (keywords, modified) and all distributions with format, file size, and download link
- Both views share a Datasets / Workflows tab nav
- SPARQL queries live in `src/stores/catalog.ts`; views are purely presentational

### Workflow & Provenance Browsing (implemented)
- Workflow list at `/workflows`: queries all `wild:WorkflowModel` resources, shows title and description
- Workflow model at `/workflow?uri=<modelUri>`: shows read-only step skeleton + a list of `wild:WorkflowInstance` run cards; clicking a run navigates to `/run`
- Workflow run at `/run?uri=<instanceUri>`: editable title/description (SPARQL DELETE/INSERT), step timeline driven by `wild:ActivityInstance` resources linked via `wild:inWorkflowInstance`
  - Steps retrieved by traversing the model's `wild:hasBehaviour / wild:hasChildActivities / rdf:rest* / rdf:first`
  - Activity instances attached to steps via `wild:activityInstanceOf` (direct or via leaf of parallel step)
  - Datasets shown per activity instance via `dcterms:isPartOf <activityInstanceUri>`
  - Cross-cutting datasets (`dcterms:isPartOf <workflowInstanceUri>`) in a "Full-run Datasets" section
  - "Add dataset" per step/activity instance opens `AddDatasetModal` scoped to the current run
- `dcterms:isPartOf` on a dataset points to a `wild:ActivityInstance` (step-level) or `wild:WorkflowInstance` (cross-cutting) — never to a model activity
- Dataset detail at `/dataset?uri=` **Workflow Context** section:
  - Shows the model activity title (via `activityInstanceOf`) as "Collected during"
  - Shows parent step if the model activity is a leaf (e.g. under `ParallelActivity`)
  - "Part of run: [name] →" navigates to the run detail page
- Workflow store: `src/stores/workflow.ts` — `fetchWorkflows()`, `fetchWorkflow(uri)`, `fetchWorkflowInstances(modelUri)`, `fetchRun(instanceUri)`, `updateWorkflowInstance(uri, title, desc)`, `fetchWorkflowStepOptions(instanceUri?)`, `addWorkflowModel(form)`, `fetchWorkflowForEdit(uri)`, `updateWorkflowModel(uri, form)`, `updateWorkflowModelMetadata(uri, form)`
- Workflow context on datasets: `fetchDatasetWorkflowContext(uri)` in `src/stores/catalog.ts`

### Workflow Model Authoring (implemented)
- **Create**: "Add Workflow" button on `/workflows` opens `AddWorkflowModal`; user defines title, description, and an ordered list of steps (each `AtomicActivity` or `ParallelActivity` with optional sub-steps); generates a WiLD-compliant `WorkflowModel` with a root `SequentialActivity` and `hasChildActivities` RDF lists; navigates to the new workflow on success
- **Edit — full structural edit** (no runs exist): "Edit Workflow" button on `/workflow?uri=` opens `AddWorkflowModal` pre-populated via `fetchWorkflowForEdit`; user can change titles, descriptions, step types, add/remove steps; `updateWorkflowModel` deletes the old structure (6 sequential SPARQL DELETEs covering steps, leaves, and list blank nodes) and inserts fresh triples; `dcterms:issued` is preserved via `FILTER(?p != dcterms:issued)`
- **Edit — metadata only** (runs exist): same button opens the modal in `metadataOnly` mode; structural controls (add/remove step, type change) are hidden and a note explains why; only `dcterms:title` and `dcterms:description` are updated on the workflow model and each existing step/leaf via `updateWorkflowModelMetadata`; the RDF list structure is never touched
- `StepForm.uri` and `SubStepForm.uri` carry existing resource URIs when loaded via `fetchWorkflowForEdit`; these are used by `updateWorkflowModelMetadata` to target the correct triples
- Step titles are stored as "Step N: \<name\>" in the triple store; `fetchWorkflowForEdit` strips this prefix for display and `addWorkflowModel`/`updateWorkflowModel` re-add it on save based on array position

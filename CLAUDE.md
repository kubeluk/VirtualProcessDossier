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
    AddActivityModal.vue   # Modal for creating/editing a library atomic activity
    StepEditorNode.vue     # Recursive step-editing component used by AddWorkflowModal
    WorkflowStepNode.vue   # Recursive read-only step display used by WorkflowView
  views/
    HomeView.vue            # Landing page → links to /catalog
    CatalogView.vue         # Browse all datasets (card list)
    DatasetView.vue         # Dataset detail; route: /dataset?uri=<encoded-uri>
    WorkflowListView.vue    # Browse all workflow models; create new workflow
    WorkflowView.vue        # Workflow model detail: step skeleton + runs list + edit button
    RunView.vue             # Workflow run detail: editable header, step timeline, datasets
    ActivityListView.vue    # Activity library: browse/create/edit reusable atomic activities
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

### Procedure / System / Input (seeded)
- **`wild:AtomicActivity` ≡ `sosa:Procedure`** in this data model — each atomic activity is also typed `sosa:Procedure`
- Each `sosa:Procedure` may carry:
  - `ssn:implementedBy` → `ssn:System` — the machine or station that executes the step
  - `ssn:hasInput` → `ssn:Input` — the material or data consumed by the step
- Seeded `ssn:System` resources: `vpd:sys-intake-station`, `vpd:sys-cnc-line-a`, `vpd:sys-hydraulic-presses-b`, `vpd:sys-cmm-dispatch`
- Seeded `ssn:Input` resources: `vpd:input-raw-stock`, `vpd:input-machined-blanks`, `vpd:input-machined-parts`, `vpd:input-formed-parts`
- Confirmed valid SSN terms used: `ssn:System`, `ssn:Input`, `ssn:hasInput`, `ssn:implementedBy`

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
| `/activities` | `activities` | ActivityListView | Activity library: browse/create/edit reusable atomic activities |

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
- Workflow store: `src/stores/workflow.ts` — `fetchWorkflows()`, `fetchWorkflow(uri)` (returns recursive `WorkflowStep` tree), `fetchWorkflowInstances(modelUri)`, `fetchRun(instanceUri)`, `updateWorkflowInstance(uri, title, desc)`, `fetchWorkflowStepOptions(instanceUri?)`, `addWorkflowModel(form)`, `fetchWorkflowForEdit(uri)` (returns recursive `StepForm` tree), `updateWorkflowModel(uri, form)`, `updateWorkflowModelMetadata(uri, form)`, `deleteWorkflowModel(uri)` (4 sequential SPARQL DELETEs; only call when no runs exist)
- `WorkflowStep` interface carries `children: WorkflowStep[]`; `fetchWorkflow` uses a two-query approach (metadata + full treeQuery) with a recursive `buildStep` to populate the tree at any depth
- Workflow context on datasets: `fetchDatasetWorkflowContext(uri)` in `src/stores/catalog.ts`

### Dataset Search & Filtering (implemented)
- Filter panel on `/catalog` above the dataset list; filters are applied server-side via SPARQL
- **Text search** (debounced 400 ms): `CONTAINS(LCASE(...))` across `dcterms:title`, `dcterms:description`, and `dcat:keyword` (keyword match via `FILTER EXISTS`)
- **Keyword chips**: togglable pill buttons populated from all `dcat:keyword` values present in the catalog; multiple selections use OR logic (`FILTER EXISTS { ... IN (...) }`)
- **Workflow Run select**: filters datasets directly `isPartOf` a `wild:WorkflowInstance` or linked via an `ActivityInstance`'s `wild:inWorkflowInstance`
- **Workflow Model select**: same traversal extended by `wild:workflowInstanceOf`; disabled when a run is already selected (run is more specific)
- Filter options (keywords, runs, models) are loaded once on mount via `fetchFilterOptions()` — only options that have at least one associated dataset are offered
- Active filters shown as dismissible chips; "Clear all" button; result count updates to "X datasets matching your filters"
- Catalog store: `fetchDatasets(filters?: DatasetFilters)` builds SPARQL `FILTER` / `FILTER EXISTS` clauses conditionally; `fetchFilterOptions(): Promise<DatasetFilterOptions>` runs 3 parallel queries for keywords, runs, models
- `DatasetFilters` and `DatasetFilterOptions` interfaces exported from `src/stores/catalog.ts`

### Workflow Model Authoring (implemented)
- **Create**: "Add Workflow" button on `/workflows` opens `AddWorkflowModal`; user defines title, description, root behaviour type, and an arbitrarily deep tree of steps; each node can be `AtomicActivity` (leaf), `ParallelActivity`, or `SequentialActivity`; generates a WiLD-compliant `WorkflowModel` with the selected root activity type (`SequentialActivity` or `ParallelActivity`) and nested `hasChildActivities` RDF lists; navigates to the new workflow on success
- **Create from template**: when at least one workflow model exists, a "Start from a template" select is shown at the top of the create form; selecting a workflow calls `fetchWorkflowForEdit` and pre-populates title, description, and the full step tree; all step `uri` fields are stripped so `addWorkflowModel` creates entirely fresh resources; the select resets to placeholder after loading so the user can apply another template if needed
- **Edit — full structural edit** (no runs exist): "Edit Workflow" button on `/workflow?uri=` opens `AddWorkflowModal` pre-populated via `fetchWorkflowForEdit`; user can change titles, descriptions, activity types, add/remove nodes at any depth; `updateWorkflowModel` deletes the old structure (4 sequential SPARQL DELETEs using depth-unlimited property paths) and inserts fresh triples; `dcterms:issued` is preserved via `FILTER(?p != dcterms:issued)`; a "Delete Workflow" button is shown left-aligned in the modal footer — on confirmation calls `deleteWorkflowModel` and emits `deleted`, which `WorkflowView` handles by navigating to `/workflows`
- **Edit — metadata only** (runs exist): same button opens the modal in `metadataOnly` mode; structural controls (add/remove, type change, root type selector) are hidden; only `dcterms:title` and `dcterms:description` are updated recursively on the workflow model and all existing activity nodes via `updateWorkflowModelMetadata`; the RDF list structure is never touched
- `AddWorkflowForm.rootType` (`'SequentialActivity' | 'ParallelActivity'`) controls the type of the root `wild:hasBehaviour` node; defaults to `SequentialActivity`; read back by `fetchWorkflowForEdit` from the root node's RDF type; parallel root requires at least 2 top-level steps (validated in the modal)
- `StepForm` is self-referencing (`children: StepForm[]`) to support arbitrary nesting; `StepForm.uri` carries the existing resource URI when loaded for edit and is used by `updateWorkflowModelMetadata` to target the correct triples
- Step titles are stored verbatim as entered by the user; ordering is derived from the RDF list structure (`wild:hasChildActivities`), not from title prefixes
- `StepEditorNode.vue` is a self-referencing recursive component (uses both `<script>` for exported types/factory and `<script setup>` for instance logic); exports `StepFormWithId` and `newStepWithId` for use by `AddWorkflowModal`
- `WorkflowStepNode.vue` is a self-referencing recursive component for read-only display; sequential children render in a grey-bordered cluster, parallel children in a blue-bordered cluster; each composite node has a ▶/▼ collapse toggle; the circle badge shows `index + 1` (position derived from the RDF list order, not from the title)

### Workflow Run Registration (implemented)
- **Start Run**: "+ Start Run" button in the Runs section of `/workflow?uri=` opens `AddRunModal`; user provides a title (required) and optional description; navigates directly to the new run on success
- **What gets created**: a `wild:WorkflowInstance` with `workflowInstanceOf <modelUri>`, `dcterms:title`, optional `dcterms:description`, `prov:startedAtTime`, and `wild:hasState wild:initialized`; plus one `wild:ActivityInstance` per activity node in the model (root behaviour + all descendants via `(wild:hasChildActivities/rdf:rest*/rdf:first)*`); the root behaviour's activity instance gets `wild:hasState wild:active`, all others get `wild:hasState wild:initialized`
- Activity instance URIs use the pattern `vpd:actinst-<slug>-<suffix>-<n>`; workflow instance URI uses `vpd:wfinst-<slug>-<suffix>`
- `AddRunModal.vue` — simple modal (title + description); emits `created(instanceUri)` on success
- Workflow store: `addWorkflowRun(modelUri, title, description): Promise<string>` — queries all model activities, builds and executes a single `INSERT DATA`; returns the new instance URI
- `fetchRun` bug fix: `parentStep` is now only used as the attachment target when it is itself present in `stepsMap` (i.e. a parallel step); previously top-level atomic steps were silently dropped because their `parentStep` was the root behaviour (not in `stepsMap`)

### System & Input on Atomic Activities (implemented)
- Each `wild:AtomicActivity` (= `sosa:Procedure`) can have an optional `ssn:System` (via `ssn:implementedBy`) and `ssn:Input` (via `ssn:hasInput`) linked to it
- **Browsing**: `WorkflowStepNode` displays "System: …" and "Input: …" as metadata rows on leaf nodes when values are present
- **Authoring**: `StepEditorNode` shows a collapsible "▸ System & input" accordion on atomic nodes with two `<select>` dropdowns populated from the triple store; the section auto-expands when a step already has values linked; the accordion is hidden for library-ref steps (their properties are managed in the Activity Library)
- `StepFormWithId.systemUri` and `.inputUri` hold the selected URI (empty string = none); `StepForm.systemUri?` and `.inputUri?` are the optional store-layer equivalents
- `AddWorkflowModal` loads `fetchSystemOptions()`, `fetchInputOptions()`, and `fetchAtomicActivityOptions()` in parallel when opening (both create and edit modes); passes them down to each `StepEditorNode`
- System/input triples are written in `addWorkflowModel`, `updateWorkflowModel` (full edit), and `updateWorkflowModelMetadata` (metadata-only, safe when runs exist — these properties are not structural)
- Workflow store: `fetchSystemOptions(): Promise<ProcedureOption[]>`, `fetchInputOptions(): Promise<ProcedureOption[]>` — query all `ssn:System` / `ssn:Input` resources ordered by title; `ProcedureOption` interface exported from `src/stores/workflow.ts`

### Activity Library (implemented)
- Reusable `wild:AtomicActivity` resources that can be referenced by workflow models instead of defining activities inline
- **Browse**: `/activities` lists all library activities with title, description, system, and input; tab nav shared with Datasets and Workflows
- **Create / Edit / Delete**: clicking a card or "+ Add Activity" opens `AddActivityModal`; title required; system and input selects; delete button with confirmation
- **Library activities are identified by `dcterms:issued`** set at creation time — this distinguishes them from inline workflow steps which do not get `dcterms:issued`
- URI pattern: `<base>activity-<slug>-<suffix>`; also typed `sosa:Procedure`
- **Reuse in workflow editor**: `StepEditorNode` shows a "From activity library" dropdown for every `AtomicActivity`-type step; selecting an existing activity sets `isLibraryRef = true`, pre-fills title/description/system/input as read-only, and writes the activity's existing URI into the `hasChildActivities` list (no new resource minted). Clearing the picker back to "— Define new activity —" switches to inline authoring.
- **Library ref protection**: `updateWorkflowModel` and `deleteWorkflowModel` skip deleting descendant nodes that have `dcterms:issued` (`FILTER NOT EXISTS { ?desc dcterms:issued ?_ }`); `updateWorkflowModelMetadata` skips `isLibraryRef` steps — their metadata is only editable from `/activities`
- `StepForm.isLibraryRef?` and `StepFormWithId.isLibraryRef` carry the flag through the form layer; `fetchWorkflowForEdit` detects library refs by checking for `dcterms:issued` on each child node in the tree query
- Workflow store new functions: `fetchAtomicActivities(): Promise<AtomicActivitySummary[]>`, `fetchAtomicActivityOptions(): Promise<AtomicActivityOption[]>`, `addAtomicActivity(form)`, `updateAtomicActivity(uri, form)`, `deleteAtomicActivity(uri)`; interfaces `AtomicActivitySummary`, `AtomicActivityOption`, `AtomicActivityForm` exported from `src/stores/workflow.ts`

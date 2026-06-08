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
    material.ts  # Parts + material lineage queries (fetchParts, fetchPartDetail)
  components/
    AddDatasetModal.vue       # Modal for adding a new dataset to a run step
    AddWorkflowModal.vue      # Modal for creating a workflow model or editing its metadata/structure
    AddActivityModal.vue      # Modal for creating/editing a library atomic activity (incl. parameter shapes)
    AddSystemModal.vue        # Modal for creating/editing an ssn:System
    StepEditorNode.vue        # Recursive step-editing component used by AddWorkflowModal
    WorkflowStepNode.vue      # Recursive read-only step display used by WorkflowView
    RunActivityNode.vue       # Recursive activity instance display used by RunView (with state + datasets)
    ShaclFormWrapper.vue      # Reusable Vue wrapper for <shacl-form> custom element; used by RunActivityNode
  views/
    HomeView.vue            # Landing page → links to /catalog
    CatalogView.vue         # Browse all datasets (card list)
    DatasetView.vue         # Dataset detail; route: /dataset?uri=<encoded-uri>
    WorkflowListView.vue    # Browse all workflow models; create new workflow
    WorkflowView.vue        # Workflow model detail: step skeleton + runs list + edit button
    RunView.vue             # Workflow run detail: editable header, step timeline, datasets
    ActivityListView.vue    # Activity library: browse/create/edit reusable atomic activities
    SystemListView.vue      # System library: browse/create/edit ssn:System instances
    PartListView.vue        # Parts overview: material lineage + properties + needle-point viz
data/
  catalog.ttl       # dcat:Catalog + dcat:Dataset + dcat:Distribution → vpd dataset
  workflow.ttl      # wild:WorkflowModel + all activity definitions → vpd dataset
  systems.ttl       # ssn:System hierarchy (machines, grippers, oven zones, press) → vpd dataset
  material.ttl      # laminat, layup, tape, part entities + needle-point positions → vpd dataset
  runs.ttl          # wild:WorkflowInstance + wild:ActivityInstance resources → vpd dataset
  plans.ttl         # prov:Plan parameter values per activity instance → vpd dataset
  unit.ttl          # QUDT unit definitions → qudt dataset
  quantitykind.ttl  # QUDT quantity-kind definitions → qudt dataset
  seed.sh           # Init script run by the 'seed' Docker service
  archive/          # Retired seed files (old CNC machining domain + SHACL parameter shapes)
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

- The `seed` service manages two Fuseki datasets:
  - **`vpd`** — application data; auto-created and seeded from `data/catalog.ttl`, `data/workflow.ttl`, `data/systems.ttl`, `data/material.ttl`, `data/runs.ttl`, and `data/plans.ttl` on first start; the UI reads from and writes to this dataset
  - **`qudt`** — static reference data (QUDT units + quantity kinds); auto-created and seeded from `data/unit.ttl` + `data/quantitykind.ttl` on first start; the UI reads from this dataset but never writes to it
- Seeding is skipped on subsequent starts if the target dataset already contains triples.
- Fuseki admin UI: `http://localhost:3030` (credentials: `admin` / `admin`)

## SPARQL / Jena

- Dev proxy: `/sparql` → `http://localhost:3030/vpd/sparql`
- Update endpoint: `/update` → `http://localhost:3030/vpd/update`
- Endpoint URL configurable via `VITE_SPARQL_ENDPOINT` in `.env`
- Base service layer: `src/services/sparql.ts` — `querySparql()` and `updateSparql()`

## Knowledge Graph / RDF Conventions

- **Ontology**: [DCAT 3](https://www.w3.org/TR/vocab-dcat-3/) for the data catalog structure
- **DCAT namespace**: `http://www.w3.org/ns/dcat#` (http, not https — as declared in dcat3.ttl)
- **Namespace strategy**: domain-specific prefixes rather than a single monolithic `vpd:` base:
  - `vpd: <http://purl.org/vpd/data#>` — catalog and dataset resources
  - `workflow: <http://purl.org/for/workflow#>` — workflow models and composite activities
  - `activity: <http://purl.org/for/activity#>` — atomic activity definitions
  - `run: <http://purl.org/for/run#>` — workflow instances and activity instances
  - `machine: <http://purl.org/for/machine#>` — machines and subsystems
  - `plan: <http://purl.org/for/plan#>` — parameter plans
  - `param: <http://purl.org/for/param#>` — parameter predicates (domain vocabulary)
  - `laminat:`, `layup:`, `tape:`, `part:`, `pos:` — material domain entities
- **Supporting vocabularies**: `dcterms`, `rdfs`, `prov`, `sosa`, `ssn`, `wild`, `qudt`, `unit` (QUDT), `quantitykind` (QUDT), `geo` (GeoSPARQL `<http://www.opengis.net/ont/geosparql#>`)
- **Annotation predicates**: `rdfs:label` / `rdfs:comment` for domain resources (machines, activities, runs, plans); `dcterms:title` / `dcterms:description` for catalog and dataset nodes only
- **DCAT distribution structure**: `dcat:Distribution` is a blank node (not a named resource); `dcat:mediaType` and `dcat:temporalResolution` are properties of the distribution, not the dataset; catalog URI is `vpd:it`
- Ontologies for new features are provided incrementally and documented here as they are added

### Provenance (seeded)
- Each `dcat:Dataset` is linked directly to its producing run via `prov:wasGeneratedBy <run>`; there is no `sosa:Observation` intermediary
- The physical output of a run (the formed part) is a `sosa:Sample` linked via `sosa:hasResult` on the run; datasets are a side-product of the run, not the primary output
- `wild:WorkflowInstance` is also typed `sosa:Sampling` and `prov:Activity` — the run is simultaneously a provenance activity, a sampling event, and a workflow instance
- The run carries `sosa:usedProcedure <workflowModel>`, `sosa:madeBySampler`, `sosa:hasFeatureOfInterest`
- Material lineage is expressed via PROV-O: part → laminat → layup → tapes using `prov:wasDerivedFrom` + `prov:qualifiedDerivation`; fiber orientation per tape layer stored as a `qudt:Quantity` on each `prov:qualifiedDerivation`
- Verified namespaces (dereferenced from W3C specs): `prov: <http://www.w3.org/ns/prov#>`, `sosa: <http://www.w3.org/ns/sosa/>`, `ssn: <http://www.w3.org/ns/ssn/>`
- Confirmed valid terms — SOSA: `Sampling`, `Sample`, `Sampler`, `madeBySampler`, `usedProcedure`, `hasFeatureOfInterest`, `hasResult`, `isResultOf`, `isSampleOf` — PROV: `Activity`, `Entity`, `Plan`, `Collection`, `wasGeneratedBy`, `wasDerivedFrom`, `qualifiedDerivation`, `qualifiedAssociation`, `wasAssociatedWith`, `hadPlan`, `hadMember`, `startedAtTime`
- `sosa:ObservationCollection` and `ssn:observes` do **not** exist in the standards — do not use them

### Workflow (seeded)
- **Ontology**: [WiLD](http://purl.org/wild/vocab) — Workflows in Linked Data; `wild: <http://purl.org/wild/vocab#>`
- The stamp-forming workflow is described at two levels:
  - **`wild:WorkflowModel`** (`workflow:stampForming`) — static structure; defines the expected activities and their order/composition; annotated with `rdfs:label` / `rdfs:comment`
  - **`wild:WorkflowInstance`** (`run:1`) — runtime execution; also typed `sosa:Sampling` and `prov:Activity`
- **Workflow model tree** — root behaviour is a `wild:ParallelActivity`; `wild:hasChildActivities` (RDF list) encodes structure:
  - Branch A: `activity:gripping` — `wild:AtomicActivity` (gripper frame holds laminate throughout)
  - Branch B: `workflow:heatingTransferingForming` — `wild:SequentialActivity` containing:
    - `activity:heating` — `wild:AtomicActivity`
    - `activity:transfering` — `wild:AtomicActivity`
    - `activity:forming` — `wild:AtomicActivity`
- Each `wild:ActivityInstance` is also typed `prov:Activity` and carries:
  - `wild:activityInstanceOf` → the corresponding `wild:Activity` in the model
  - `wild:inWorkflowInstance` → the run
  - `wild:hasState wild:done`
  - `prov:wasAssociatedWith <machine>` + `prov:qualifiedAssociation [ prov:agent <machine> ; prov:hadPlan <plan> ]` — for activity instances that involve a machine
- Confirmed valid WiLD terms: `WorkflowModel`, `WorkflowInstance`, `ActivityInstance`, `SequentialActivity`, `ParallelActivity`, `AtomicActivity`, `hasBehaviour`, `hasChildActivities`, `workflowInstanceOf`, `activityInstanceOf`, `inWorkflowInstance`, `hasState`, `done`, `active`

### Procedure / System / Input (seeded)
- Machine–activity association has moved from the **model level** to the **instance level**:
  - Model activities (`wild:AtomicActivity`) no longer carry `ssn:implementedBy`
  - Activity instances carry `prov:wasAssociatedWith <machine>` + a `prov:qualifiedAssociation` that co-locates the machine agent with its parameter plan: `[ a prov:Association ; prov:agent <machine> ; prov:hadPlan <plan> ]`
- **Machine subsystem hierarchy**: machines are modeled as `ssn:System` trees via `ssn:hasSubSystem` at arbitrary depth
  - `machine:gripperFrame` → 8 grippers (`gripper:1` … `gripper:8`), each with sub-sensors
  - `machine:oven` → `machine:ir_top`, `machine:ir_bottom` → middle / edge / corner zones
  - `machine:press` — flat (no sub-systems in the seed)
- Physical dimensions on machines (e.g. frame size) are expressed as `qudt:Quantity` nodes via `geo:hasSize`
- Positional references (gripper positions, laminate needle points) use the `pos:` namespace; origins typed `pos:Origin`; coordinate vectors typed `qudt:Quantity` with `qudt:hasQuantityKind quantitykind:PositionVector`; XY components stored as a 2-element RDF list under `qudt:value`, queryable via `rdf:first` / `rdf:rest/rdf:first`
- Material predicates on tape and layup entities use the `param:` namespace: `param:fiberOrientation` (on `prov:qualifiedDerivation` blank nodes), `param:polymer`, `param:fiberType` (on `tape:` entities), `param:hasNeedlePoint` (on `laminat:` entities); the old file-local `@prefix : <#>` was replaced with these stable URIs
- Confirmed valid SSN terms used: `ssn:System`, `ssn:hasSubSystem`, `ssn:implementedBy`, `ssn:implements`

## Domain Context

This UI abstracts RDF/SPARQL complexity from end users. Features are built around specific ontologies provided incrementally. All SPARQL is generated in the service layer — never exposed raw to users.

## Routes

| Path | Name | View | Description |
|------|------|------|-------------|
| `/` | `home` | HomeView | Dossier gallery — scrollable overview of all produced parts; the primary landing page of the application |
| `/catalog` | `catalog` | CatalogView | Browse all datasets |
| `/dataset?uri=` | `dataset` | DatasetView | Dataset detail (uri = full encoded dataset URI) |
| `/workflows` | `workflows` | WorkflowListView | Browse all workflow models |
| `/workflow?uri=` | `workflow` | WorkflowView | Workflow model detail: step skeleton + list of runs (uri = WorkflowModel URI) |
| `/run?uri=` | `run` | RunView | Workflow run detail: editable header, activity instance tree with state + datasets (uri = WorkflowInstance URI) |
| `/activities` | `activities` | ActivityListView | Activity library: browse/create/edit reusable atomic activities |
| `/systems` | `systems` | SystemListView | System library: browse/create/edit ssn:System instances |
| `/parts` | `parts` | PartListView | Parts overview: material lineage, laminat properties, ply stack, needle-point visualization |
| `/dossier?part=` | `dossier` | DossierView | Virtual Process Dossier: one-page summary of part identity, process timeline, and material — links to detail views (part = sosa:Sample URI) |

## Features

### Data Catalog Browse (implemented)
- Dataset list at `/catalog`: queries all `dcat:Dataset` resources linked via `dcat:Catalog`; shows title, description, distribution count
- Dataset detail at `/dataset?uri=<encoded-uri>`:
  - **Workflow Context** section: shows the run label (via `prov:wasGeneratedBy` → `rdfs:label`) with a link to the run view, and the workflow model label with a link to the workflow view
  - **Distributions** section: one row per blank-node distribution showing `dcat:mediaType`, `dcat:temporalResolution`, and `dcat:downloadURL`; no byte-size or distribution title
- `WorkflowContext` interface: `{ runUri, runLabel, workflowUri, workflowLabel }` — populated by `fetchDatasetWorkflowContext(uri)` via `prov:wasGeneratedBy` + `wild:workflowInstanceOf` + `rdfs:label`; `DatasetProvenance` interface and `fetchDatasetProvenance` have been removed
- `Distribution` interface: `{ downloadURL, mediaType, temporalResolution }` — all optional; distributions are blank nodes so they are keyed by array index in the UI
- Both views share a Datasets / Workflows tab nav
- SPARQL queries live in `src/stores/catalog.ts`; views are purely presentational

### Workflow & Provenance Browsing (implemented)
- Workflow list at `/workflows`: queries all `wild:WorkflowModel` resources, shows title and description
- Workflow model at `/workflow?uri=<modelUri>`: shows read-only step skeleton + a list of `wild:WorkflowInstance` run cards; clicking a run navigates to `/run`
- Workflow run at `/run?uri=<instanceUri>`: editable title/description (SPARQL DELETE/INSERT); primary content is the **Activity Instances** tree — one node per model activity, driven by the model tree structure
  - Tree mirrors the model's `wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)*` hierarchy at any depth
  - Each node shows: model activity title (from `rdfs:label` on the model activity), `wild:hasState` badge (verbatim ontology values: `initialized`, `active`, `done`), and — for atomic nodes — dataset chips + "+ Add dataset"
  - **Two kinds of activity instance**: control flow instances (created by `addWorkflowRun`, identified by `FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }`) carry state; observation instances (created by `addDataset`, typed `sosa:Observation`) carry datasets via `dcterms:isPartOf`. `fetchRun` queries them separately and merges by model activity.
  - Cross-cutting datasets (`dcterms:isPartOf <workflowInstanceUri>`) in a "Full-run Datasets" section
  - "Add dataset" per activity opens `AddDatasetModal` scoped to the current run, preselected to the model activity URI
- `dcterms:isPartOf` on a dataset points to a `wild:ActivityInstance` (step-level) or `wild:WorkflowInstance` (cross-cutting) — never to a model activity
- Dataset detail at `/dataset?uri=` **Workflow Context** section:
  - Shows the model activity title (via `activityInstanceOf`) as "Collected during"
  - Shows parent step if the model activity is a leaf (e.g. under `ParallelActivity`)
  - "Part of run: [name] →" navigates to the run detail page
- Workflow store: `src/stores/workflow.ts` — `fetchWorkflows()`, `fetchWorkflow(uri)` (returns recursive `WorkflowStep` tree), `fetchWorkflowInstances(modelUri)`, `fetchRun(instanceUri)`, `updateWorkflowInstance(uri, title, desc)`, `fetchWorkflowStepOptions(instanceUri?)`, `addWorkflowModel(form)`, `fetchWorkflowForEdit(uri)` (returns recursive `StepForm` tree), `updateWorkflowModel(uri, form)`, `updateWorkflowModelMetadata(uri, form)`, `deleteWorkflowModel(uri)` (4 sequential SPARQL DELETEs; only call when no runs exist)
- `WorkflowDetail` carries `rootType: 'SequentialActivity' | 'ParallelActivity' | null` — the type of the root `wild:hasBehaviour` node; fetched alongside the workflow metadata in `fetchWorkflow` by querying `?root a ?rootType`
- `WorkflowStep` interface carries `children: WorkflowStep[]`; `fetchWorkflow` uses a two-query approach (metadata + full treeQuery) with a recursive `buildStep` to populate the tree at any depth
- `WorkflowView` renders a **root behaviour badge** (`⟷ Parallel` / `↕ Sequential`) with a collapse toggle above the step cluster; the step cluster uses `.step-list--parallel` (blue-tinted left border) or `.step-list--sequential` (green-tinted left border) matching the inner composite node styling in `WorkflowStepNode`; top-level `WorkflowStepNode` instances receive `context="parallel"` or `context="sequential"` based on `rootType`
- `RunDetail` carries `rootType: 'SequentialActivity' | 'ParallelActivity' | null` — fetched in `fetchRun` from the model's root behaviour node type; `RunView` uses it to render the same root behaviour badge + tinted cluster as `WorkflowView`, and passes the correct `context` prop to top-level `RunActivityNode` instances
- `RunActivityInstance` interface is recursive (`children: RunActivityInstance[]`); carries `state`, `modelActivityTitle`, `modelActivityType`, `datasets`; `RunStep` has been removed — `RunDetail.activityInstances` holds top-level tree nodes directly
- `RunActivityNode.vue` is a self-referencing recursive component (same pattern as `WorkflowStepNode`); atomic nodes show title + state badge (verbatim WiLD state: `initialized`/`active`/`done`) + dataset chips; composite nodes show type badge + state badge + collapse toggle + child cluster (green for sequential, blue for parallel)
- Workflow context on datasets: `fetchDatasetWorkflowContext(uri)` in `src/stores/catalog.ts`

### Dataset Search & Filtering (implemented)
- Filter panel on `/catalog` above the dataset list; filters are applied server-side via SPARQL
- **Text search** (debounced 400 ms): `CONTAINS(LCASE(...))` across `dcterms:title` and `dcterms:description`
- **Workflow Run select**: filters datasets by `prov:wasGeneratedBy <run>`
- **Workflow Model select**: same traversal extended via `wild:workflowInstanceOf`; disabled when a run is already selected
- Filter options (runs, models) loaded once on mount via `fetchFilterOptions()` — only options that have at least one linked dataset are offered; labels from `rdfs:label`
- Active filters shown as dismissible chips; "Clear all" button; result count updates to "X datasets matching your filters"
- Catalog store: `fetchDatasets(filters?: DatasetFilters)` builds `FILTER EXISTS` clauses conditionally; `fetchFilterOptions(): Promise<DatasetFilterOptions>` runs 2 parallel queries (runs, models)
- `DatasetFilters` interface: `{ search?, workflowRunUri?, workflowModelUri? }` — no keyword field
- `DatasetFilterOptions` interface: `{ workflowRuns: { uri, label }[], workflowModels: { uri, label }[] }` — no keyword list
- `AddDatasetModal`: title, description, download URL (required), media type, temporal resolution, workflow run select; no keyword or byte-size fields; run options loaded from `fetchFilterOptions()`

### Workflow Model Authoring (implemented)
- **Create**: "Add Workflow" button on `/workflows` opens `AddWorkflowModal`; user defines title, description, root behaviour type, and an arbitrarily deep tree of steps; each node can be `AtomicActivity` (leaf), `ParallelActivity`, or `SequentialActivity`; generates a WiLD-compliant `WorkflowModel` with the selected root activity type (`SequentialActivity` or `ParallelActivity`) and nested `hasChildActivities` RDF lists; navigates to the new workflow on success
- **Create from template**: when at least one workflow model exists, a "Start from a template" select is shown at the top of the create form; selecting a workflow calls `fetchWorkflowForEdit` and pre-populates title, description, and the full step tree; all step `uri` fields are stripped so `addWorkflowModel` creates entirely fresh resources; the select resets to placeholder after loading so the user can apply another template if needed
- **Edit — full structural edit** (no runs exist): "Edit Workflow" button on `/workflow?uri=` opens `AddWorkflowModal` pre-populated via `fetchWorkflowForEdit`; user can change activity titles/descriptions, activity types, add/remove nodes at any depth; `updateWorkflowModel` deletes the old structure (4 sequential SPARQL DELETEs using depth-unlimited property paths) and inserts fresh triples; `dcterms:issued` is preserved via `FILTER(?p != dcterms:issued)`; a "Delete Workflow" button is shown left-aligned in the modal footer — on confirmation calls `deleteWorkflowModel` and emits `deleted`, which `WorkflowView` handles by navigating to `/workflows`
- **Edit — metadata only** (runs exist): same button opens the modal in `metadataOnly` mode; structural controls (add/remove, type change, root type selector) are hidden; `updateWorkflowModelMetadata` updates `rdfs:label`/`rdfs:comment` on the workflow model and each `AtomicActivity` node only (composite nodes carry no metadata); the RDF list structure is never touched
- `AddWorkflowForm.rootType` (`'SequentialActivity' | 'ParallelActivity'`) controls the type of the root `wild:hasBehaviour` node; defaults to `SequentialActivity`; read back by `fetchWorkflowForEdit` from the root node's RDF type; parallel root requires at least 2 top-level steps (validated in the modal)
- `StepForm` is self-referencing (`children: StepForm[]`) to support arbitrary nesting; `StepForm.uri` carries the existing resource URI when loaded for edit and is used by `updateWorkflowModelMetadata` to target the correct triples
- **Only `wild:AtomicActivity` nodes carry metadata** (`rdfs:label`, `rdfs:comment`); composite nodes (`SequentialActivity`, `ParallelActivity`) are purely structural containers with no data title. Ordering is derived entirely from the RDF list structure (`wild:hasChildActivities`); `fetchWorkflowForEdit` preserves SPARQL result insertion order (which follows list traversal) rather than sorting by title.
- `StepEditorNode.vue` is a self-referencing recursive component (uses both `<script>` for exported types/factory and `<script setup>` for instance logic); exports `StepFormWithId` and `newStepWithId` for use by `AddWorkflowModal`; title/description fields are shown only for `AtomicActivity` nodes
- `WorkflowStepNode.vue` is a self-referencing recursive component for read-only display; **atomic nodes** render with a filled numbered circle, title, description, and system/input metadata; **composite nodes** render as anonymous structural containers — a hollow numbered circle + a type badge (`⟷ Parallel` / `↕ Sequential`) with a ▶/▼ collapse toggle; when collapsed the badge is followed by an activity count hint; all nodes receive a numbered circle regardless of nesting depth or parent context (connector line is only drawn in sequential flow); color coding: sequential containers use green badge + green-tinted cluster (`#f0fdf4` / `#bbf7d0`), parallel containers use blue badge + blue-tinted cluster (`#f8faff` / `#bfdbfe`) — consistent with `StepEditorNode`

### Workflow Run Registration (implemented)
- **Start Run**: "+ Start Run" button in the Runs section of `/workflow?uri=` opens `AddRunModal`; user provides a title (required) and optional description; navigates directly to the new run on success
- **What gets created**: a `wild:WorkflowInstance` with `workflowInstanceOf <modelUri>`, `rdfs:label`, optional `rdfs:comment`, `prov:startedAtTime`, and `wild:hasState wild:done`; plus one `wild:ActivityInstance, prov:Activity` per activity node in the model (root behaviour + all descendants via `(wild:hasChildActivities/rdf:rest*/rdf:first)*`); all activity instances get `wild:hasState wild:done` immediately — registering a run represents a completed execution whose input data is filled in afterwards via the SHACL input forms
- Activity instance URIs use the pattern `vpd:actinst-<slug>-<suffix>-<n>`; workflow instance URI uses `vpd:wfinst-<slug>-<suffix>`
- `AddRunModal.vue` — simple modal (title + description); emits `created(instanceUri)` on success
- Workflow store: `addWorkflowRun(modelUri, title, description): Promise<string>` — queries all model activities, builds and executes a single `INSERT DATA`; returns the new instance URI
- `fetchRun` uses 5 queries: (1) run metadata + modelUri + rootUri + rootType; then in parallel: (2) model activity tree (parent→child pairs + title + type), (3) control flow instances (`FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }`), (4) datasets grouped by model activity (via observation instances), (5) cross-cutting datasets. Builds `RunActivityInstance` tree recursively from model structure.

### System & Input on Atomic Activities (implemented)
- Each `wild:AtomicActivity` (= `sosa:Procedure`) can have an optional `ssn:System` (via `ssn:implementedBy`) and `ssn:Input` (via `ssn:hasInput`) linked to it
- **Browsing**: `WorkflowStepNode` displays "System: …" and "Input: …" as metadata rows on leaf nodes when values are present
- **Authoring**: `StepEditorNode` shows a collapsible "▸ System & input" accordion on atomic nodes with two `<select>` dropdowns populated from the triple store; the section auto-expands when a step already has values linked; the accordion is hidden for library-ref steps (their properties are managed in the Activity Library)
- `StepFormWithId.systemUri` and `.inputUri` hold the selected URI (empty string = none); `StepForm.systemUri?` and `.inputUri?` are the optional store-layer equivalents
- `AddWorkflowModal` loads `fetchSystemOptions()`, `fetchInputOptions()`, and `fetchAtomicActivityOptions()` in parallel when opening (both create and edit modes); passes them down to each `StepEditorNode`
- System/input triples are written in `addWorkflowModel`, `updateWorkflowModel` (full edit), and `updateWorkflowModelMetadata` (metadata-only, safe when runs exist — these properties are not structural); `updateWorkflowModelMetadata` only touches `AtomicActivity` nodes, so system/input updates are naturally scoped correctly
- Workflow store: `fetchSystemOptions(): Promise<ProcedureOption[]>`, `fetchInputOptions(): Promise<ProcedureOption[]>` — query all `ssn:System` / `ssn:Input` resources ordered by title; `ProcedureOption` interface exported from `src/stores/workflow.ts`

### System Library (implemented)
- `ssn:System`, `sosa:Sensor`, and `sosa:Actuator` resources representing machines, stations, and their components
- **Browse**: `/systems` lists all top-level systems with a type badge (System / Sensor / Actuator); each card with sub-systems shows a "▶ N sub-systems" disclosure toggle that expands a `SystemSubTree` tree view with `├─`/`└─` connectors, per-node collapse, and type-coloured badges; tab nav shared with Datasets, Workflows, and Activities
- **Sub-system hierarchy**: each system node can have zero or more sub-systems via `ssn:hasSubSystem`; sub-systems can themselves have sub-systems (arbitrary depth); each node independently chooses its type (System / Sensor / Actuator)
- **Create / Edit / Delete**: clicking a card or "+ Add System" opens `AddSystemModal` (600 px); root node has a type radio group; a purple-tinted "Sub-systems" cluster uses the recursive `SystemNodeEditor` component to author the tree; name and identifier are mandatory on every node; activity checklist (`ssn:implements`) is on the root only
- **Identifier**: stored as `dcterms:identifier`; slugified to form the root URI at create time — `<base>sys-<slugified-identifier>`; sub-system URIs use `<base>sys-<child-slug>-<n>` and are regenerated on each update (sub-systems are not referenced externally)
- **`ssn:implements`**: written on the system side (`<system> ssn:implements <activity>`); coexists with the activity-side `ssn:implementedBy` triples written by the workflow editor; `deleteSystem` also cleans up any `ssn:implementedBy <uri>` triples on activities and uses `(ssn:hasSubSystem)*` property path to delete all descendant nodes
- **`updateSystem`**: performs a full delete of root + all descendants via `<root> (ssn:hasSubSystem)* ?node`, then inserts fresh triples; root URI is stable, sub-system URIs are regenerated
- **`fetchSystemOptions`**: returns all `ssn:System`, `sosa:Sensor`, and `sosa:Actuator` instances (for the workflow step editor's "implemented by" dropdown)
- Components: `SystemNodeEditor.vue` (recursive editor, exports `SystemNodeFormWithId` and `newSystemNodeWithId`), `SystemSubTree.vue` (recursive read-only tree browser)
- Interfaces exported from `src/stores/workflow.ts`: `SystemNodeType`, `SystemNodeSummary`, `SystemSummary`, `SystemNodeForm`, `SystemForm`
- Workflow store functions: `fetchSystems(): Promise<SystemSummary[]>`, `addSystem(form)`, `updateSystem(uri, form)`, `deleteSystem(uri)`

### Activity Library (implemented)
- Reusable `wild:AtomicActivity` resources that can be referenced by workflow models instead of defining activities inline
- **Browse**: `/activities` lists all library activities with title, description, system, and input; tab nav shared with Datasets and Workflows
- **Create / Edit / Delete**: clicking a card or "+ Add Activity" opens `AddActivityModal`; title required; system and input selects; delete button with confirmation
- **All `wild:AtomicActivity` nodes carry `dcterms:issued`** — including those created inline in the workflow editor; this is what makes them appear in the activity library and reuse dropdown; `fetchAtomicActivities` and `fetchAtomicActivityOptions` filter on `dcterms:issued ?_`
- Inline atomic activities created via `addWorkflowModel` or `updateWorkflowModel` receive `dcterms:issued` at write time; `fetchWorkflowForEdit` detects their `dcterms:issued` and sets `isLibraryRef = true`, so on subsequent edits they appear as library refs (read-only properties, picker pre-selected)
- URI pattern for explicitly-created library activities: `<base>activity-<slug>-<suffix>`; also typed `sosa:Procedure`
- **Reuse in workflow editor**: `StepEditorNode` shows a "From activity library" dropdown for every `AtomicActivity`-type step; selecting an existing activity sets `isLibraryRef = true`, pre-fills title/description/system/input as read-only, and writes the activity's existing URI into the `hasChildActivities` list (no new resource minted). Clearing the picker back to "— Define new activity —" switches to inline authoring.
- **Library ref protection**: `updateWorkflowModel` and `deleteWorkflowModel` skip deleting descendant nodes that have `dcterms:issued` (`FILTER NOT EXISTS { ?desc dcterms:issued ?_ }`); `updateWorkflowModelMetadata` skips `isLibraryRef` steps — their metadata is only editable from `/activities`
- **Delete guard**: an activity cannot be deleted while it appears in any `wild:WorkflowModel`'s behaviour tree; `AddActivityModal` checks `isAtomicActivityInUse(uri)` on open and disables the Delete button with a "Used in a workflow — cannot delete" hint when true; `askSparql` (new helper in `src/services/sparql.ts`) handles SPARQL ASK queries returning `boolean`
- `StepForm.isLibraryRef?` and `StepFormWithId.isLibraryRef` carry the flag through the form layer; `fetchWorkflowForEdit` detects library refs by checking for `dcterms:issued` on each child node in the tree query
- Workflow store functions: `fetchAtomicActivities(): Promise<AtomicActivitySummary[]>`, `fetchAtomicActivityOptions(): Promise<AtomicActivityOption[]>`, `addAtomicActivity(form)`, `updateAtomicActivity(uri, form)`, `isAtomicActivityInUse(uri): Promise<boolean>`, `deleteAtomicActivity(uri)`; interfaces `AtomicActivitySummary`, `AtomicActivityOption`, `AtomicActivityForm` exported from `src/stores/workflow.ts`

### Material / Parts Overview (implemented)
- **Browse**: `/parts` shows all `sosa:Sample` resources (manufactured parts); each card has a color-coded top border (amber) and loads full detail automatically on mount
- **Lineage trail** in the card header: four connected chips — Part ← Laminat ← Layup ← N× Tape — each in a distinct color (amber / emerald / blue / violet); immediately communicates the full derivation chain at a glance
- **"Produced in run"** button navigates to `/run` for provenance context
- Three collapsible sections per part (progressive disclosure):
  1. **Laminat Properties** — material label, identifier, dimensions (length/width/thickness via `geo:hasSize`), fiber mass fraction (`param:hasFiberMassFraction`); properties sorted in a stable display order (L → W → T → mass fraction)
  2. **Ply Stack** — layup notation label, table of layers ordered by tape URI; columns: layer index, tape ID, fiber type, polymer, orientation badge (color-coded: emerald 0° / blue 60° / violet 120°); uses `prov:qualifiedDerivation` + `param:fiberOrientation` + `param:polymer` / `param:fiberType`
  3. **Needle Points** — SVG footprint diagram (400×400 mm laminat with XY axis, amber circles labeled 1–8 at `param:hasNeedlePoint` positions) alongside a coordinate table with sign-colored values (green positive / red negative); XY extracted via `rdf:first` / `rdf:rest/rdf:first` on the RDF list stored under `qudt:quantityValue/qudt:value`
- Store: `src/stores/material.ts` — `fetchParts(): Promise<PartSummary[]>` (one query), `fetchPartDetail(summary): Promise<PartDetail>` (three parallel queries); unit URIs and quantitykind URIs mapped to display symbols via local-name lookup tables
- Interfaces: `PartSummary`, `PartDetail`, `LaminatProperty`, `PlySummary`, `NeedlePoint` — all exported from `src/stores/material.ts`
- Tab nav on all list views updated to include the "Parts" tab

### Activity Input Parameters via PROV-O + QUDT (seeded; UI adaptation pending)
- The SHACL-form approach (design-time `sh:NodeShape` shapes + flat runtime `prov:Plan` with `sh:path` predicates) has been superseded by a native PROV-O + QUDT parameter model
- **Parameter plans**: each activity instance that involves a machine carries a `prov:Plan` linked via `prov:hadPlan` inside its `prov:qualifiedAssociation`; the plan URI pattern is `plan:<runId>_<activityName>` (e.g. `plan:1_press`, `plan:1_heating`)
- **Parameter values**: each parameter is a `qudt:Quantity` node with `qudt:hasQuantityKind`, `qudt:hasUnit`, and `qudt:value`; domain-specific predicates from the `param:` namespace name the parameter role (e.g. `param:pressForce`, `param:closingSpeed`, `param:temperatureGoal`, `param:zoneControl`)
- **Per-subsystem plans**: for machines with independently controlled subsystems, the plan is a `prov:Collection` with `prov:hadMember` sub-plans — one per subsystem; each sub-plan carries `prov:wasDerivedFrom <subsystem>` to trace the parameter value to the exact machine component it configures
- **Ordered step parameters**: parameters that form a sequence (e.g. `param:closingSpeedSteps`) use an RDF list as the object, with each list member being a blank node grouping the speed and remaining-distance values for that step
- Seed plans in `data/plans.ttl`: `plan:1_gripping` (per-gripper positions + setpoints), `plan:1_heating` (per-IR-field temperature goals and zone power percentages + holding time), `plan:1_press` (press force, cooling time, mold temperatures, multi-step closing speed profile)
- `RunActivityNode` plan rendering has been updated to use the PROV-O + QUDT model via `ActivityPlanPanel.vue` (see below); `ShaclFormWrapper` and `AddActivityModal` parameter authoring remain to be updated

### Activity Plan Parameters in RunView (implemented)
- Each atomic `RunActivityNode` shows a collapsible amber **"Machine Parameters"** panel below the dataset chips; the panel is rendered by `ActivityPlanPanel.vue`
- The panel calls `workflowStore.fetchActivityPlan(actInstUri)` on mount — 5 parallel SPARQL queries; returns `null` for activity instances with no `prov:qualifiedAssociation` (e.g. transferring), in which case the panel is hidden entirely
- **Gripping**: renders a *Gripper Positions* table — one row per gripper sub-plan, columns X (mm) / Y (mm); sign-coloured values (green positive, red negative); XY extracted via `rdf:first` / `rdf:rest/rdf:first` on the RDF list stored in `qudt:value`
- **Heating**: renders direct scalar params (holding time) + two IR-field sub-plan sections; section titles derived from the `param:temperatureGoal` entity's `prov:wasDerivedFrom` source label; each section shows temperature goal + per-zone power percentages
- **Forming/Press**: renders direct scalar params (press force, cooling time, remaining press path), source-attributed mold temperatures (upper/lower), and a *Closing Speed Profile* table with 4 phases; each phase row shows speed, an amber gradient bar proportional to the max speed, and distance remaining
- `fetchActivityPlan(actInstUri): Promise<ActivityPlanData | null>` in `src/stores/workflow.ts`; exported interfaces: `ActivityPlanData`, `PlanParamValue`, `SubPlanEntry`, `GripperPosition`, `ClosingSpeedStep`
- `QUDT_UNIT_LABELS` extended with `KiloN → kN`, `PERCENT → %`, `UNITLESS → ""`
- `RunActivityNode.vue` now imports `ActivityPlanPanel` instead of `ShaclFormWrapper`; all SHACL-related reactive state and `onMounted` hook removed from that component

### Virtual Process Dossier (implemented)
- **Route**: `/dossier?part=<sosa:Sample URI>` — anchored on the physical part since it is the artefact the dossier describes
- **Entry points**: `/` dossier gallery home page (each card has an "Open →" button); "Dossier →" amber button on part cards in PartListView; "Dossier →" amber button in RunView title row
- **Design intent**: curated one-page summary — answers "what happened to produce this part?" in one sweep without navigating between views; detail is intentionally withheld and delegated to the linked detail views
- **Header**: dark gradient card with amber top accent — part label, run label (clickable link → `/run`), date, state badge, workflow label
- **Process timeline**: horizontal strip of activity cards (one per atomic activity in model tree order); cards with plans have amber left border + key params (temperature, force, times); cards without plans have gray border + "No recorded parameters"
- **Material section**: compact lineage trail (Part ← Laminat ← Layup ← N×Tape), key dimension/fraction facts, ply orientation badges (same palette as PartListView)
- **Footer strip**: three equal-width navigation buttons — "Full material detail" (→ /parts), "Full run detail" (→ /run), dataset count
- `src/stores/dossier.ts` — `DossierData`, `DossierActivity`, `DossierHeadlineParam` interfaces; `fetchDossier(partUri)` runs 7 parallel SPARQL queries after a phase-1 header lookup; headline params limited to temperature goal, press force, cooling time, holding time, and gripper count; temperature deduplicated across IR sub-plans; `q_tree` fetches `?parentType` in addition to `?childType` so that composite root nodes (e.g. the root `ParallelActivity`) are correctly identified and drilled into by `collectAtomics` — without this, the root appears in `typeMap` as `'AtomicActivity'` and shows as "Unnamed Activity"
- `material.ts` extended with `fetchPartForRun(runUri): Promise<string | null>` — used by RunView's Dossier button
- **HomeView** (the `/` route) is now the Dossier gallery — replaces the old static landing page; loads all parts via `materialStore.fetchParts()` then fires `dossierStore.fetchDossier()` for each in parallel; each card shows: amber header with part label + run name + date + state + workflow, compact process strip (activity chips with key param values, amber border for planned activities), material summary (lineage tokens + ply orientation badges + dimensions), and a three-button footer (Parts detail / Run detail / dataset count)
- All list-view nav tabs now include "Dossier" as the first tab (links to `/`); consistent across CatalogView, WorkflowListView, ActivityListView, SystemListView, PartListView, and HomeView
- DossierView (`/dossier?part=`) now functions as a permalink/detail page for a single part; its back button navigates to the gallery home

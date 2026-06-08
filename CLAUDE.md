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
    catalog.ts   # Dataset list + detail fetching/adding
    workflow.ts  # Workflow model + run queries and mutations
    material.ts  # Parts + material lineage queries
    dossier.ts   # Virtual Process Dossier fetch
  components/
    AddDatasetModal.vue       # Modal for adding a new dataset to a run step
    AddWorkflowModal.vue      # Modal for creating a workflow model or editing its metadata/structure
    AddActivityModal.vue      # Modal for creating/editing a library atomic activity
    AddSystemModal.vue        # Modal for creating/editing an ssn:System
    StepEditorNode.vue        # Recursive step-editing component used by AddWorkflowModal
    WorkflowStepNode.vue      # Recursive read-only step display used by WorkflowView
    RunActivityNode.vue       # Recursive activity instance display used by RunView (with state + datasets)
    ActivityPlanPanel.vue     # Collapsible machine-parameter panel inside RunActivityNode
  views/
    HomeView.vue            # Dossier gallery (primary landing page, route: /)
    CatalogView.vue         # Browse all datasets
    DatasetView.vue         # Dataset detail; route: /dataset?uri=<encoded-uri>
    WorkflowListView.vue    # Browse all workflow models; create new workflow
    WorkflowView.vue        # Workflow model detail: step skeleton + runs list + edit button
    RunView.vue             # Workflow run detail: editable header, step timeline, datasets
    ActivityListView.vue    # Activity library: browse/create/edit reusable atomic activities
    SystemListView.vue      # System library: browse/create/edit ssn:System instances
    PartListView.vue        # Parts overview: material lineage + properties + needle-point viz
    DossierView.vue         # Virtual Process Dossier: one-page part summary
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
- Base service layer: `src/services/sparql.ts` — `querySparql()`, `updateSparql()`, `askSparql()` (SPARQL ASK → boolean)

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
  - Activity instances carry `prov:wasAssociatedWith <machine>` + a `prov:qualifiedAssociation` that co-locates the machine agent with its parameter plan
- **Machine subsystem hierarchy**: machines are modeled as `ssn:System` trees via `ssn:hasSubSystem` at arbitrary depth
  - `machine:gripperFrame` → 8 grippers (`gripper:1` … `gripper:8`), each with sub-sensors
  - `machine:oven` → `machine:ir_top`, `machine:ir_bottom` → middle / edge / corner zones
  - `machine:press` — flat (no sub-systems in the seed)
- Physical dimensions on machines are expressed as `qudt:Quantity` nodes via `geo:hasSize`
- Positional references (gripper positions, laminate needle points) use the `pos:` namespace; XY components stored as a 2-element RDF list under `qudt:value`, queryable via `rdf:first` / `rdf:rest/rdf:first`
- Material predicates use the `param:` namespace: `param:fiberOrientation` (on `prov:qualifiedDerivation` blank nodes), `param:polymer`, `param:fiberType` (on `tape:` entities), `param:hasNeedlePoint` (on `laminat:` entities)
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
- Dataset list at `/catalog`: queries all `dcat:Dataset` resources linked via `dcat:Catalog`
- Dataset detail: **Workflow Context** section populated via `prov:wasGeneratedBy` → `wild:workflowInstanceOf` → `rdfs:label`; **Distributions** section shows one row per blank-node distribution (keyed by array index, not URI)
- `dcterms:isPartOf` on a dataset points to a `wild:ActivityInstance` (step-level) or `wild:WorkflowInstance` (cross-cutting) — never to a model activity

### Workflow & Provenance Browsing (implemented)
- **Two kinds of activity instance**: control flow instances (created by `addWorkflowRun`, identified by `FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }`) carry state; observation instances carry datasets via `dcterms:isPartOf`. `fetchRun` queries them separately and merges by model activity.
- Activity instance tree mirrors the model's `wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)*` hierarchy at any depth; `fetchRun` uses 5 queries (metadata, model tree, control-flow instances, datasets per activity, cross-cutting datasets)
- `WorkflowView` and `RunView` both render a **root behaviour badge** (`⟷ Parallel` / `↕ Sequential`) with a collapse toggle; step clusters are color-coded (green = sequential, blue = parallel) consistently across all recursive components
- `WorkflowStep` and `RunActivityInstance` interfaces are recursive (`children: [...]`); `fetchWorkflow` uses a two-query approach (metadata + tree) with a recursive `buildStep`

### Dataset Search & Filtering (implemented)
- Filter panel on `/catalog`; filters applied server-side via SPARQL
- **Text search** (debounced 400 ms): `CONTAINS(LCASE(...))` across `dcterms:title` and `dcterms:description`
- **Workflow Run / Model selects**: only options that have at least one linked dataset are offered; Model select is disabled when a run is already selected
- Active filters shown as dismissible chips; "Clear all" button

### Workflow Model Authoring (implemented)
- **Create / Edit / Delete**: `AddWorkflowModal` supports full structural edits (no runs exist) and metadata-only edits (runs exist, `metadataOnly` mode hides structural controls)
- **Only `wild:AtomicActivity` nodes carry metadata** (`rdfs:label`, `rdfs:comment`); composite nodes are purely structural containers with no title. Ordering is derived entirely from the RDF list structure — do not sort by title.
- `updateWorkflowModel` (full edit): 4 sequential SPARQL DELETEs using depth-unlimited property paths; preserves `dcterms:issued` via `FILTER(?p != dcterms:issued)`; skips deleting library-ref descendants (`FILTER NOT EXISTS { ?desc dcterms:issued ?_ }`)
- **Parallel root** requires at least 2 top-level steps (validated in modal); `rootType` is read back from the root node's RDF type by `fetchWorkflowForEdit`
- **Create from template**: strips all step `uri` fields before calling `addWorkflowModel` so entirely fresh resources are minted

### Workflow Run Registration (implemented)
- `addWorkflowRun` creates one `wild:WorkflowInstance` + one `wild:ActivityInstance, prov:Activity` per model activity node; all instances get `wild:hasState wild:done` immediately (run registration represents a completed execution filled in after the fact)
- Activity instance URIs: `vpd:actinst-<slug>-<suffix>-<n>`; workflow instance URI: `vpd:wfinst-<slug>-<suffix>`

### System & Input on Atomic Activities (implemented)
- Each `wild:AtomicActivity` can have an optional `ssn:System` (via `ssn:implementedBy`) and `ssn:Input` (via `ssn:hasInput`)
- System/input triples are safe to update in `metadataOnly` mode — they are not structural and don't touch the RDF list

### System Library (implemented)
- **Identifier**: stored as `dcterms:identifier`; slugified to form the root URI — `<base>sys-<slug>`; sub-system URIs are regenerated on each update (not referenced externally)
- **`ssn:implements`** is written on the system side; coexists with the activity-side `ssn:implementedBy` triples from the workflow editor
- `deleteSystem` cleans up `ssn:implementedBy <uri>` triples on activities and uses `(ssn:hasSubSystem)*` to delete all descendants
- `updateSystem` does a full delete of root + all descendants, then inserts fresh triples; root URI is stable

### Activity Library (implemented)
- **`dcterms:issued`** is the marker that makes an `AtomicActivity` appear in the library and reuse dropdown — all atomic activities (inline and explicit) receive it at write time
- `fetchWorkflowForEdit` detects library refs by checking for `dcterms:issued` and sets `isLibraryRef = true`; library-ref steps render as read-only in `StepEditorNode` (properties managed from `/activities`)
- `updateWorkflowModel` and `deleteWorkflowModel` skip deleting descendants that have `dcterms:issued`; `updateWorkflowModelMetadata` skips `isLibraryRef` steps
- **Delete guard**: `isAtomicActivityInUse(uri)` (SPARQL ASK) checked on modal open; Delete button disabled with hint when true

### Material / Parts Overview (implemented)
- Parts are `sosa:Sample` resources; lineage: part → laminat → layup → tapes via `prov:wasDerivedFrom` + `prov:qualifiedDerivation`
- Needle-point XY extracted via `rdf:first` / `rdf:rest/rdf:first` on the RDF list stored under `qudt:quantityValue/qudt:value`
- Three collapsible sections per card: Laminat Properties, Ply Stack, Needle Points

### Activity Input Parameters via PROV-O + QUDT (seeded)
- The SHACL-form approach has been superseded by a native PROV-O + QUDT parameter model
- **Parameter plans**: each activity instance with a machine carries a `prov:Plan` via `prov:hadPlan` inside its `prov:qualifiedAssociation`; plan URI pattern: `plan:<runId>_<activityName>`
- **Parameter values**: each parameter is a `qudt:Quantity` node with `qudt:hasQuantityKind`, `qudt:hasUnit`, and `qudt:value`; domain predicates from `param:` namespace name the role
- **Per-subsystem plans**: plan is a `prov:Collection` with `prov:hadMember` sub-plans; each sub-plan carries `prov:wasDerivedFrom <subsystem>`
- **Ordered step parameters** (e.g. `param:closingSpeedSteps`) use an RDF list as the object

### Activity Plan Parameters in RunView (implemented)
- Each atomic `RunActivityNode` shows a collapsible amber **"Machine Parameters"** panel rendered by `ActivityPlanPanel.vue`
- `fetchActivityPlan(actInstUri)` returns `null` for activity instances with no `prov:qualifiedAssociation` (e.g. transferring) — panel hidden entirely in that case
- `ActivityPlanPanel` handles gripping (gripper-position table), heating (per-IR-field sub-plan sections), and forming/press (scalar params + closing-speed profile table)

### Virtual Process Dossier (implemented)
- **Route**: `/dossier?part=<sosa:Sample URI>` — anchored on the physical part
- **Entry points**: `/` gallery (each card has "Open →"); "Dossier →" button in PartListView and RunView
- **Design intent**: curated one-page summary — answers "what happened to produce this part?" without navigating between views; detail delegated to linked detail views
- **Datasets section**: pass raw URI to Vue Router — do NOT use `encodeURIComponent` (that double-encodes since the router already encodes query params)
- `q_tree` in `fetchDossier` must fetch `?parentType` in addition to `?childType` so composite root nodes are correctly identified by `collectAtomics`; without it, the root `ParallelActivity` appears as `AtomicActivity` and renders as "Unnamed Activity"
- **HomeView** (`/`) is the Dossier gallery — loads all parts then fires `fetchDossier` for each in parallel; `DossierView` (`/dossier?part=`) is the permalink/detail page

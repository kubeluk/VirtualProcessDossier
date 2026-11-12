# Virtual Process Dossier

VPD lets manufacturing users prepare production runs and explore their recorded context without writing SPARQL.

The overview connects production runs, input laminates, machine initialization settings, equipment, observations, and external datasets. Run preparation uses a four-step wizard: choose defaults or copy a run, confirm the laminate, configure the three machines, and review the initialization. The demonstrator records execution afterwards.

## Start with example data

```sh
docker compose up --build
```

- UI: http://localhost:8080
- Fuseki: http://localhost:3030 (development credentials: admin / admin)

On an empty store, the seed service validates and loads only the Turtle statements from the `data/` files listed in [`scripts/seed.ts`](scripts/seed.ts), preserving their identities, values, and URLs. The bundle contains the supplied completed run, its laminate and plans, the reference models and shapes, the standalone catalog records, and the three synthetic datasets declared in [`data/catalog.ttl`](data/catalog.ttl). Seeding generates no additional records. The alternative `run-view-after-ui.ttl` snapshot is excluded because it describes the same run identity in an earlier state.

Existing nonempty stores are preserved. The seed does not migrate older models or replace existing records. To explicitly reset this project's development data:

```sh
docker compose down -v
docker compose up --build
```

The reset deletes this Compose project's data volume. To use another port, set `UI_PORT` and `FUSEKI_PORT` before startup. Synthetic download URLs are loaded exactly as declared in `data/catalog.ttl`; edit that source file before seeding if another public UI origin is needed. `ADMIN_PASSWORD` configures the development Fuseki administrator.

## Develop locally

Use Node 22 and npm.

```sh
npm ci
docker compose up -d jena seed
npm run dev
```

Vite proxies `/sparql` and `/update` to the `vpd` dataset on localhost:3030. Vite and nginx attach the Fuseki write credentials on the server; credentials are never included in the SPA bundle. Set `ADMIN_PASSWORD` consistently when changing the development administrator password. Copy `.env.example` when overriding endpoints. For another local Fuseki, set `FUSEKI_PROXY_TARGET` and, if needed, `FUSEKI_DATASET` when starting Vite.

```sh
npm run build
npm run lint
npm test
```

Lint is read-only. Unit and Vue component tests cover RDF serialization, shape validation, list handling, defaults, copying, and machine forms.

## Verify the triple-store contract

The integration suite creates a uniquely named dataset on an isolated Fuseki instance and removes that dataset afterwards. It does not use the application's `vpd` dataset.

```sh
docker compose -p vpd-tests -f docker-compose.test.yml up -d
npm run test:integration
docker compose -p vpd-tests -f docker-compose.test.yml down
```

The test Fuseki listens on localhost:3330. Set `FUSEKI_URL` to use another test instance and `ADMIN_PASSWORD` if needed.

Tests compare the UI's generated RDF with the supplied initialization snapshot and plans using RDF dataset canonicalization, independently query the resulting triples, verify retry safety, execute shop-floor templates that create atomic instances with independent used plans and observation datasets, and check provenance-aware discovery.

Browser end-to-end testing is intentionally left to the user. See [the competency coverage and manual checks](data/docs/ui-verification.md).

## Model and implementation

The authoritative model is under [data](data), including the parameter shapes, material shapes, example snapshots, and SPARQL templates. Seeding uses an explicit file list so alternative snapshots and older models are not loaded together.

- A run selects its laminate through `for:workflowInitialization/for:laminate`.
- UI-created laminates use `laminate/{id}#it`, with stable child fragments such as `#layup`, `#tape-0`, and `#length`. Ordered list cells also have stable fragments, such as `#tape-stack-list-0` and `#position-0-list-0`. Copies receive a fresh laminate ID. Edits replace exclusively owned resources; shared resources that would be overwritten require creating a copy. Existing records are not automatically migrated.
- Initialization creates one initialized workflow, five initialized composite activity instances, and three fresh parameter plans. The shop-floor system creates atomic activity instances; all 43 activities remain in the process definition.
- Planned settings belong to the run's `for:workflowInitialization/for:parameterization/prov:hadMember` collection, retaining quantities, units, component references, and ordered RDF lists.
- The shop-floor system creates atomic executions and independently records their used settings through `prov:qualifiedAssociation/prov:hadPlan`, alongside the association's equipment. Execution plans can be named or anonymous, and can differ from planned settings. No activity initialization links are required.
- Upper and lower mold temperatures are the press temperature settings; redundant heater targets are omitted from new drafts and writes. Older session drafts retain their other inputs when restored.
- Run parameters and process details show recorded used settings separately from planned settings. Missing used values remain explicit. Copying a run uses its planned settings only.
- Datasets link to generating observations through `prov:wasGeneratedBy`; observations supply sensor, measured property, feature of interest, and workflow membership.
- Specified settings and expected sensor configuration are distinct from recorded execution facts.
- Initialization writes no execution times, completed states, output-part assumptions, or observations.

Source layout:

| Directory             | Responsibility                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| `src/domain`          | RDF terms, list traversal, workflow structure, initialization contract |
| `src/services`        | SPARQL repositories, filtering, pagination, guarded writes             |
| `src/stores`          | Cached reference data and explicit refresh                             |
| `src/components`      | Machine forms, context links, recursive metadata and process views     |
| `src/views`           | Overview, browsing, entity detail, run preparation                     |
| `scripts/seed.ts`     | Validated, non-destructive startup seeding                             |
| `data/catalog.ttl`    | Standalone and connected dataset metadata                              |
| `public/example-data` | Synthetic downloadable example files                                   |
| `tests`               | Unit, component, and real-Fuseki integration tests                     |

The UI retains no legacy workflow, equipment, activity, or dataset authoring editors. Saved runs are read-only; copy their settings to prepare another run.

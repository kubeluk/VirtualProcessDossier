# Virtual Process Dossier

VPD lets manufacturing users prepare production runs and explore their recorded context without writing SPARQL.

The overview connects production runs, input laminates, machine initialization settings, equipment, observations, and external datasets. Run preparation uses a four-step wizard: choose defaults or copy a run, confirm the laminate, configure the three machines, and review the initialization. The demonstrator records execution afterwards.

## Start with example data

```sh
docker compose up --build
```

- UI: http://localhost:8080
- Fuseki: http://localhost:3030 (development credentials: admin / admin)

On an empty store, the seed service validates and loads the examples before starting the UI. It creates two **different** run identities: the supplied completed example and a remapped initialized example, each linked to its own laminate. Three additional, explicitly synthetic datasets demonstrate connected provenance, with small downloadable files served by the UI. The original standalone catalog examples retain their missing execution context.

Existing nonempty stores are preserved. The seed does not migrate older models or replace existing records. To explicitly reset this project's development data:

```sh
docker compose down -v
docker compose up --build
```

The reset deletes this Compose project's data volume. To use another port/origin, set `UI_PORT`, `FUSEKI_PORT`, and `PUBLIC_BASE_URL` before startup. Set `PUBLIC_BASE_URL` to the public UI origin so synthetic file links resolve correctly. `ADMIN_PASSWORD` configures the development Fuseki administrator.

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

The authoritative model is under [data](data), including the parameter shapes, material shapes, example snapshots, and SPARQL templates. Historical snapshots are preserved; the initialized seed example is projected onto the current initialization contract.

- A run selects its laminate through `for:workflowInitialization/for:laminate`.
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
| `data/demo`           | Supplemental synthetic dataset metadata                                |
| `public/example-data` | Synthetic downloadable example files                                   |
| `tests`               | Unit, component, and real-Fuseki integration tests                     |

The UI retains no legacy workflow, equipment, activity, or dataset authoring editors. Saved runs are read-only; copy their settings to prepare another run.

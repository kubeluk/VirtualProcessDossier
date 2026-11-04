# Repository Guidelines

This file is the single source of truth for repository instructions.

## Project Structure & Module Organization

Virtual Process Dossier is a Vue 3/TypeScript UI backed by an RDF store (Apache Jena Fuseki).

- `src/domain/`: RDF terms, workflow initialization, laminate logic, and validation.
- `src/services/repository.ts`: SPARQL queries and guarded writes.
- `src/components/`, `src/views/`: reusable UI and routed pages; `src/stores/` holds Pinia state.
- `src/assets/`: styles; `public/example-data/`: downloadable synthetic files.
- `data/`: authoritative Turtle models, SHACL shapes, query templates, and documentation.
- `scripts/seed.ts`: validated startup seeding; `tests/`: unit, component, and integration suites.

## Build, Test, and Development Commands

Use Node 22 and npm.

- `npm ci`: install locked dependencies.
- `docker compose up -d jena seed`: start and seed the local backend.
- `npm run dev`: launch Vite with Fuseki proxying.
- `docker compose up --build`: run the complete stack (UI `:8080`, Fuseki `:3030`).
- `npm run build`: type-check with vue-tsc and build into `dist/`.
- `npm run lint`: run read-only ESLint checks.
- `npm test`: run unit and component tests.

See README for seeding, proxy configuration, development data reset, and integration-test setup.

## Coding Style & Naming Conventions

Use Vue 3 Composition API with `<script setup lang="ts">` and strict TypeScript, Pinia, Vue Router, N3, and the existing SHACL engine. Follow `.prettierrc.json`: two-space indentation, single quotes, no semicolons, trailing commas, and 100-column lines. Use PascalCase Vue filenames (`MachineParameters.vue`), camelCase functions, and `use*` composables. Keep RDF logic in `src/domain/` and SPARQL in `src/services/repository.ts`, outside view components.

## Testing Guidelines

Use Vitest; component tests use Vue Test Utils and jsdom. Name tests `*.spec.ts` under `tests/unit/`, `tests/components/`, or `tests/integration/`. No numeric coverage threshold is configured; cover changed behavior and RDF contracts.

For integration tests, start the isolated backend with `docker compose -p vpd-tests -f docker-compose.test.yml up -d`, then run `npm run test:integration`. It uses Fuseki on `:3330` and temporary datasets. Browser checks are user-performed; follow `data/docs/ui-verification.md` and do not add or run automated browser suites.

## Commit & Pull Request Guidelines

History favors short imperative subjects, such as `Add laminate CRUD UI with defaults and template copies`, without mandatory prefixes. Keep commits focused. PRs should explain behavior changes, list validation results, link relevant issues, and include screenshots for UI changes.

## Domain & Configuration Safeguards

The RDF model in `data` is fixed. Read its current Turtle, shapes, documentation, and query templates before changing domain behavior. Earlier models using separate output samples, direct dataset-to-run provenance, or completed-run registration are obsolete.

Never automatically clear, migrate, or reseed nonempty application data. Use `.env.example`; keep Fuseki credentials server-side, outside `VITE_` variables.

## Domain Contract

- Initialize one workflow instance and all model activity instances with `wild:initialized`. The supplied workflow has 43 nodes, including 38 atomic activities and 29 planned observation activities.
- Link the laminate with `for:workflowInitialization/for:laminate`.
- Link the three parameter plans through the run's parameterization collection, `for:initialization`, and reverse `for:initialized`.
- Preserve exact namespaces, quantity types, units, component identities, and ordered RDF lists.
- Never fabricate execution timestamps, completed states, observation metadata, execution associations, or a separate physical output part.
- Read dataset context through `prov:wasGeneratedBy` → observation → `wild:inWorkflowInstance`.
- The explicit mapping in `src/domain/expectations.ts` is demonstrator configuration, not recorded observation metadata.
- Parameter shapes are targetless: validate each plan against its equipment shape explicitly. Laminate shapes include SHACL-SPARQL.
- New run identities and plan identities are fresh; repeated submission of one draft is guarded and verifies the saved settings.
- The two supplied run snapshots describe the same identity. Never seed both unchanged into one graph.

## User Flows

The landing page is a context overview. The primary areas are production runs, laminates, datasets, and equipment. Process definitions and arbitrary entity metadata are linked detail views.

Run preparation is defaults/copy → identity and confirmed laminate → machine settings → review and initialize. Retain drafts in session storage. The demonstrator owns subsequent execution updates. Saved records are read-only.

Use progressive disclosure and readable labels. Preserve missing context explicitly. Expose full metadata through entity links and nested disclosures rather than a SPARQL editor.

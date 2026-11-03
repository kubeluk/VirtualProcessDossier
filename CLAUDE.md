# VPD UI development guide

## Source of truth

The RDF model in `data` is fixed. Read its current Turtle, shapes, documentation, and query templates before changing domain behavior. Earlier models using separate output samples, direct dataset-to-run provenance, or completed-run registration are obsolete.

Use Vue 3 Composition API, strict TypeScript, Pinia, Vue Router, N3, and the existing SHACL engine. Keep RDF logic in `src/domain` and SPARQL in `src/services/repository.ts`, outside view components.

## Contract

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

## User flows

The landing page is a context overview. The primary areas are production runs, laminates, datasets, and equipment. Process definitions and arbitrary entity metadata are linked detail views.

Run preparation is defaults/copy → identity and confirmed laminate → machine settings → review and initialize. Retain drafts in session storage. The demonstrator owns subsequent execution updates. Saved records are read-only.

Use progressive disclosure and readable labels. Preserve missing context explicitly. Expose full metadata through entity links and nested disclosures rather than a SPARQL editor.

## Commands

- `npm run dev`
- `npm run build`
- `npm run lint` (no fixes)
- `npm test`
- `npm run test:integration` (isolated Fuseki on localhost:3330)
- `docker compose up --build`

See README for seeding, proxy configuration, development data reset, and integration-test setup. Browser end-to-end testing is performed manually by the user; do not add or run an automated browser suite.

Do not automatically clear, migrate, or reseed nonempty application data.

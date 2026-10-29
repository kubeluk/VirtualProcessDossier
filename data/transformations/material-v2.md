# Material v2 migration

Run from the repository root (using the existing npm dependencies):

```sh
node data/transformations/migrate_material_v2.mjs
node --test tests/material-migration.test.mjs
```

The script writes `data/material-v2.ttl` and `data/material-v2-validation.json`.
It reads `data/material.ttl` and the shapes in `data/material-example.ttl`.
The source file and triple store are untouched. The output contains instance
triples; load ontology/shapes separately if required.

## Changes

- Add `for:Laminate`, `for:Layup`, `for:Tape`, `for:NeedlePoint`,
  `for:ReferencePoint`, `for:FiberOrientation`, and `for:FiberMassFraction` types.
  Preserve existing explicit superclass types.
- Change the parameter namespace from `http://purl.org/for/param#` to
  `http://purl.org/for/parameter#`.
- Move laminates to `data/laminate/{old-id}#it`, layups to the owning laminate's
  `#layup`, and tapes to `data/tape/{old-id}#it` under `http://purl.org/for/`.
- Move needle points to the owner's `#needle-point-{old-point-id}`. Retain their
  original numeric IDs rather than renumbering them within each laminate.
- Clone shared reference-point metadata into each laminate's `#origin`.
  Replace laminate `pos:hasPositionalReference` and point `prov:wasDerivedFrom`
  reference links with point `param:referencePoint` links.
- Replace layup `prov:value` with `param:tapeStack`; retain the RDF list and order.
- Add `quantitykind:PlaneAngle` to orientation quantities.
- Rewrite every material IRI occurrence, including extraction `prov:generated`
  and part lineage links. Preserve part, run, and extraction IRIs, quantities,
  literal values, language tags, and historical extraction descriptions.

The script verifies every source triple against its defined rewrite and checks
that serialization round-trips without changing the resulting graph. It validates
each complete laminate closure against SHACL Core and SHACL-SPARQL constraints,
including the ordered-stack checks, and ensures all domain instances are covered.

## Known source gaps

The output has 141 laminates, 141 layups, 1,086 tapes, 1,128 needle points, and
141 reference points (49,521 triples; source: 43,488). Shape violations remain on
laminates 6, 7, 58, and 118 because mandatory identifiers/dimensions are missing
from the source. No measurements or identifiers are invented. Details are in
`data/material-v2-validation.json`.

Other files still reference legacy material IRIs. Loading this output as a
replacement for the old graph requires updating those external references too;
this migration only rewrites references within the material graph.

## Existing Fuseki databases

Changing the seed file does not modify an already populated database. To migrate
an existing local store, preview the update, then apply it with a backup:

```sh
node data/transformations/migrate_material_store.mjs
node data/transformations/migrate_material_store.mjs --apply --backup /tmp/vpd-before-material-v2.ttl
```

The script saves a complete default-graph backup before changing anything. It
updates material IRIs everywhere in the default graph (including external run
and extraction links), updates only material parameter predicates, and adds the
new types and reference-point structure in one Fuseki update request. Existing
blank nodes and unrelated data remain in place. An already migrated store is a
no-op; mixed old/new data is rejected for inspection.

Configure a different server with `FUSEKI_ENDPOINT`, `FUSEKI_UPDATE_ENDPOINT`,
`FUSEKI_USER`, and `FUSEKI_PASSWORD`. Defaults match the local Docker setup.
`data/seed.sh` now loads `material-v2.ttl` for new databases.

Run the UI's actual batch queries against a migrated local Fuseki instance with:

```sh
VPD_FULL_GRAPH_TEST=1 VPD_FUSEKI_ENDPOINT=http://localhost:3030/vpd/sparql \
  node --test --test-name-pattern='complete migrated material graph' tests/material-ui.test.mjs
```

This read-only test checks Parts, Dossier gallery, Laminates, and editing an
incomplete migrated laminate. Only the named integration test should be run with
`VPD_FUSEKI_ENDPOINT`; other tests use synthetic local fixtures.

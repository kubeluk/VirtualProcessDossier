# UI verification

## Automated contract coverage

Run `npm test` and `npm run test:integration` as described in the root README.

| Competency questions                    | UI path                                                        | Automated evidence                                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–8: material and laminate traceability | Laminates → laminate → material/layup/needle points → run      | Source parsing, material SHACL including SPARQL, reference graph reads, RDF-list validation                                                                                                   |
| 9–15: workflow structure and execution  | Run → Process; linked process definition                       | 43 model nodes, five initialized composite instances, 38 shop-floor-owned atomic activities, 29 planned observation activities, list order, initialization and completion states                                                                 |
| 16–18: equipment and sensors            | Equipment → system/subsystem/sensor; observation → equipment   | Exact equipment references, supplied observation-binding query, recorded sensor and feature assertions                                                                                        |
| 19–26: initialization settings          | Prepare run; Run → Parameters; equipment → accepted parameters | Full graph equivalence against initialization snapshot plus plans, explicit targetless shape validation, defaults, datatypes, units, component cardinalities, ordered profile, copy isolation |
| 27–32: observations                     | Run → Observations & datasets → observation                    | Supplied read queries, 29 completed observations, shop-floor templates creating atomic identities, independent named/anonymous used plans, and observation datasets                                                              |
| 33–38: datasets and provenance          | Datasets → dataset → observation/run/laminate/equipment        | Observation-mediated filters, standalone records, multiple distributions without duplicate counts, direct laminate versus equipment observations                                              |

The graph-equivalence oracle comes from the supplied RDF files, not the writer under test. Blank-node labels are canonicalized; named run/activity/plan identities are remapped by their semantic relationships. Existing graph data must remain unchanged after initialization.

## Manual browser checks

The user performs browser testing; no automated end-to-end suite is included.

1. Start a fresh development Compose project. Confirm the single completed run and its laminate, and five datasets, matching the selected Turtle files in `data/`. Open a synthetic dataset's file link.
2. Open the completed run. Check its input laminate, execution interval, parameter overview, process structure, 29 recorded observations, and three connected datasets.
3. Expand gripping observations by angle, force, and extension. Navigate from an observation to its sensor, observed property, observed entity, and dataset.
4. Start from defaults. At laminate selection, choose Create a new laminate (including when all existing laminates are unavailable). Save from defaults or a template and check that the run draft is retained, the new laminate is selected, and input confirmation is still required. Cancel creation once and confirm the original draft is retained. Confirm the laminate, enter all eight gripper positions, change machine settings, reorder the closing profile, review, and initialize. The result must show five initialized workflow groups, no atomic execution records, and no recorded execution times. Check all three saved parameter plans and copy the run before any shop-floor execution.
5. Copy a prior run. Confirm Press contains upper and lower mold temperatures without separate heater targets. Change both temperatures, refresh, and confirm the draft is retained. Save and check the planned settings. Open the completed example: Parameters must show planned settings separately from recorded used settings, grouped by execution and equipment; Process must expose the same used settings. Expand anonymous plans inline, inspect positions and the ordered closing profile, and check that no editing controls appear. An unexecuted run must show no used settings. If shop-floor values differ from planned values, both must remain distinct and copying must use the planned values.
6. Try blank coordinates, fractional setpoints, and an empty required value. The UI must retain the draft and report validation errors before writing.
7. Simulate a failed save response. Retrying the same draft must not duplicate resources. Changing settings after an already committed submission must report an identity conflict.
8. Browse the laminate's six tape layers in order, fiber orientations, composition, dimensions, and eight needle points with the laminate reference.
9. Open a standalone catalog dataset. It must explicitly show missing run and sensor context without assigning the example run.
10. Use dataset and run filters; reload their URLs and navigate back. Confirm the selected context and filters remain understandable.
11. Explore All metadata, nested quantities, ordered lists, and referring records. Compare the supplied laminate with one created in step 4: dimensions should use the same plain number formatting and expand inline, with an Open record link for quantities that have a URI. Expand Value type to inspect the recorded numeric literal. Check direct links, missing resources, and empty results.
12. Repeat the main navigation and preparation flow on a narrow screen and with a keyboard.

## Startup behavior

- Empty dataset: validate the seed graph, then load the bundle in one Graph Store request before starting the UI.
- Nonempty dataset: preserve all triples and skip loading.
- Invalid fixture or failed upload: the seed exits unsuccessfully; Compose must not start the UI through its seed dependency.
- The seed graph contains exactly the selected `data/` files, with no generated records or rewritten identities, values, or URLs. Only the completed run snapshot is loaded; the earlier initialized snapshot describes the same identity. Connected synthetic datasets are declared alongside the standalone records in `data/catalog.ttl`.
- Validate named and anonymous plans against equipment shapes without replacing their RDF term types. Existing nonempty stores are preserved; older heater/link constraints are adapted locally for validation, without migrating stored shapes.

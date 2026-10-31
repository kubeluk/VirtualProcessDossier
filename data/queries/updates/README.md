# Inserting production metadata into the VPD

This guide is for an LLM or integration service translating production events into SPARQL updates. Read the selected `.rq` file before rendering it. The files are executable examples with placeholder values, not ready-to-submit production requests.

## 1. Scope and sources of truth

These templates record completed activity executions, their systems or sensors, applied parameter plans, generated dataset locations, and the completed production run with its output part. Measurement files stay in the production data storage; the triple store holds their metadata and download URLs. A sensor activity normally represents an observation interval or acquisition, rather than one RDF activity for every sample in a time series.

Use these repository files to resolve identifiers and structure:

| Information | Source |
| --- | --- |
| Workflow, activity identifiers, hierarchy, and sequence | [workflow.ttl](../../workflow.ttl) |
| FoFa systems and sensors used by these templates | [systems-fofa.ttl](../../systems/systems-fofa.ttl) |
| Observable properties | [properties.ttl](../../properties.ttl) |
| Catalog identifier | [catalog.ttl](../../catalog.ttl) |
| Existing material identifiers and lineage | [material.ttl](../../material.ttl) |
| Examples of parameter-plan descriptions | [plans.ttl](../../plans.ttl), [plans-v2.ttl](../../plans-v2.ttl) |

Check the live store and production configuration as well. Existing seed runs and plans are examples, not evidence of what happened in a new run. The update templates reference systems, sensors, properties, laminates, and plans; they do not create their full descriptions. Ensure the required reference data is present. Do not assume the deployment's seed process loads every file listed above.

If an event lacks a required identifier, timestamp, executor, or applied configuration, obtain it from the production system or report the missing field. Do not infer execution facts from the example values in a template.

## 2. Persist an identifier map before sending updates

Keep a durable mapping from production run IDs, activity execution IDs, and dataset IDs to RDF IRIs. Allocate an IRI once for each new resource and reuse it in every reference to that resource.

| Resource | Identity rule |
| --- | --- |
| Workflow model | Reuse `http://purl.org/for/workflow#stampForming`. |
| Model activity | Reuse the exact `http://purl.org/for/activity#...` IRI from the model. |
| Workflow instance | One IRI per physical production run, shared by all its activity records. |
| Activity instance | One IRI per actual execution, including each composite and the root. Repeated executions of the same model activity need distinct instance IRIs. |
| Sensor, machine, observable property | Reuse the registered resource IRI for the actual equipment or property. |
| Parameter plan | Reuse the IRI of the configuration actually applied; a newly described configuration needs its own registered plan. |
| Input laminate | Reuse the existing material IRI for the physical input. |
| Output part | Allocate or resolve the IRI for the actual output part. |
| Dataset | One IRI per distinct dataset; reuse it for references and delivery reconciliation. |

The `000` identifiers, UUID-like values, dates, plan identifiers, and URLs in the templates are placeholders. They are not generated automatically. Substitute each binding by its meaning; do not replace every occurrence of `000` with one shared identifier.

Prefer full absolute IRIs when rendering. Important namespace distinctions:

- `activity:heating` means `http://purl.org/for/activity#heating`; it is different from `<activity/heating#it>`.
- With `BASE <http://purl.org/for/>`, `<activity/instance/ID#it>` resolves under `/for/`. A leading slash in `</activity/instance/ID#it>` would discard `/for/`.
- FoFa equipment and property IRIs start with `http://purl.org/for/fofa/`; instance IRIs in these templates start with `http://purl.org/for/`.
- The catalog in `insert-dataset.rq` is `http://purl.org/for/vpd#it`.
- Existing materials may use identifiers such as `http://purl.org/for/laminat#1`. Use the actual registered IRI, even when it differs from a template's `<laminate/000#it>` example.

## 3. Choose exactly one template per record

The generic [machine template](machine-activities/insert-machine-activity.rq) and [sensor template](sensor-activities/insert-sensor-activity.rq) explain their respective shapes. Prefer the specific files below for this workflow. Do not submit both a generic and a specific template for the same execution.

All activity names in the following tables are local names of the `activity:` namespace. Each filename is relative to this directory.

### Physical actions

| Model activity | Template | Executor in the example |
| --- | --- | --- |
| `load` | [machine-activities/insert-load.rq](machine-activities/insert-load.rq) | Demonstrator placeholder; resolve the actual system or operator. |
| `gripping` | [machine-activities/insert-gripping.rq](machine-activities/insert-gripping.rq) | FoFa gripper frame 1; applied plan required when parameterized. |
| `moveToOven` | [machine-activities/insert-move-to-oven.rq](machine-activities/insert-move-to-oven.rq) | Demonstrator placeholder; resolve the actual executor. |
| `heating` | [machine-activities/insert-heating.rq](machine-activities/insert-heating.rq) | FoFa oven 1; applied plan required when parameterized. |
| `moveToPress` | [machine-activities/insert-move-to-press.rq](machine-activities/insert-move-to-press.rq) | Demonstrator placeholder; resolve the actual executor. |
| `pressing` | [machine-activities/insert-pressing.rq](machine-activities/insert-pressing.rq) | FoFa press 1; applied plan required when parameterized. |
| `moveToInspection` | [machine-activities/insert-move-to-inspection.rq](machine-activities/insert-move-to-inspection.rq) | Demonstrator placeholder; resolve the actual executor. |
| `moveToUnload` | [machine-activities/insert-move-to-unload.rq](machine-activities/insert-move-to-unload.rq) | Demonstrator placeholder; resolve the actual executor. |
| `unload` | [machine-activities/insert-unload.rq](machine-activities/insert-unload.rq) | Demonstrator placeholder; resolve the actual executor. |

For a parameterized execution, preserve or add `prov:qualifiedAssociation [ a prov:Association ; prov:agent ?executing_system ; prov:hadPlan ?system_parameterization ]` and bind the actual plan IRI. The agent must match `prov:wasAssociatedWith`. If no dedicated plan was applied, omit both the plan binding and that association. Leaving only an unbound plan variable would still insert an incomplete association.

### Sensor observations

For the first three rows, replace `n` by an integer from 1 through 8. For the camera row, use 1 through 4. The filenames use the number without zero padding.

| Model activity | Template filename | Sensor | Observed entity | Observable property |
| --- | --- | --- | --- | --- |
| `observeGripperAngle` + `n` | `sensor-activities/insert-observe-gripper-angle-n.rq` | `sensor/angle/n#it` | `system/gripper/n#it` | `property/angle#it` |
| `observeGripperForce` + `n` | `sensor-activities/insert-observe-gripper-force-n.rq` | `sensor/force/n#it` | `system/gripper/n#it` | `property/force#it` |
| `observeGripperExtension` + `n` | `sensor-activities/insert-observe-gripper-extension-n.rq` | `sensor/extension/n#it` | `system/gripper/n#it` | `property/extension#it` |
| `observeLaminateSurfaceTemperature1` | [sensor-activities/insert-observe-laminate-surface-temperature-1.rq](sensor-activities/insert-observe-laminate-surface-temperature-1.rq) | `sensor/pyrometer/1#it` | Actual laminate IRI | `property/temperature/surface#it` |
| `observeLaminateShape` + `n` | `sensor-activities/insert-observe-laminate-shape-n.rq` | `sensor/camera/1#it` for all four | Actual laminate IRI | `property/geometry/surface#it` |

Expand the sensor, gripper, and property paths in this table against `http://purl.org/for/fofa/`. Gripper observations describe the corresponding gripper, not the laminate. The four shape observations are separate acquisitions by one camera; their indices do not identify four cameras. The current camera queries do not capture camera pose or its parameter plan; if those are required, add explicit metadata from the production configuration.

### Composite activities and finalization

| Model activity or metadata record | Template | When to record it |
| --- | --- | --- |
| `gripAndObserve` | [machine-activities/insert-grip-and-observe.rq](machine-activities/insert-grip-and-observe.rq) | When gripping and its observation branch have completed. |
| `heatAndObserve` | [machine-activities/insert-heat-and-observe.rq](machine-activities/insert-heat-and-observe.rq) | When heating and temperature acquisition have completed. |
| `inspection` | [machine-activities/insert-inspection.rq](machine-activities/insert-inspection.rq) | When the four sequential shape observations have completed. |
| `manufactureAndObserve` | [machine-activities/insert-manufacture-and-observe.rq](machine-activities/insert-manufacture-and-observe.rq) | When the manufacturing branch has completed. |
| Run, root `stampFormingFlow`, output part, and derivation | [finalize-run.rq](finalize-run.rq) | When the full run has completed successfully. |
| Dataset and download location | [insert-dataset.rq](insert-dataset.rq) | Once its producing observation and actual file location are known. |

Composite templates reside in `machine-activities/` for convenience, but record only `prov:Activity` and `wild:ActivityInstance`. Do not give these grouping nodes a fictitious actuator, sensor, or plan. Each child execution has its own record. The static model supplies the hierarchy; these queries link instances to the run and model activities without adding parent-instance links.

A complete execution of the current model contains 38 atomic activities (9 actions and 29 observations) and 5 composites. That means 42 specific activity-template executions plus the root inserted by `finalize-run.rq`: 43 activity instances and one workflow instance. Dataset count depends on the actual acquisitions and files. These counts assume each activity executes once without retries or repeats.

## 4. Fill the bindings from production facts

| SPARQL variable | Required production value |
| --- | --- |
| `?activity_instance` or `?sensor_activity_instance` | Persisted unique IRI of this execution. |
| `?activity` | Exact model activity selected above; normally leave the specific template's value unchanged. |
| `?workflow_instance` / finalization's `?workflow_run` | Shared IRI of this physical run. |
| `?start_time`, `?end_time` | Actual execution interval. |
| `?executing_system` | Actual system or operator that performed the action. |
| `?system_parameterization` | Registered plan actually applied, when applicable. |
| `?sensor` | Actual sensor IRI. |
| `?observed_entity` | Actual gripper or laminate IRI. |
| `?observed_property_of_entity` | Registered observable property IRI. |
| `?dataset` | Persisted unique dataset IRI. |
| `?dataset_download_url` | Actual data-file URL in the production storage. |
| `?part`, `?laminate` | Output part and input laminate IRIs, respectively. |
| `?workflow_behaviour` | Unique root activity-instance IRI for `activity:stampFormingFlow`; distinct from every child instance IRI. |
| `?run_start`, `?run_end` | Actual full run interval. |
| `?behaviour_start`, `?behaviour_end` | Actual root behaviour interval. |

Finalization's `?derivation`, `?previous_run_state`, and `?previous_behaviour_state` are internal variables. Keep their existing binding and matching logic.

Use valid `xsd:dateTime` values with explicit timezones, such as `"2026-10-30T10:00:00Z"^^xsd:dateTime` or `"2026-10-30T11:00:00+01:00"^^xsd:dateTime`. Start must not be after end. Preserve source precision and timezone meaning. A composite's interval must be consistent with its children's execution intervals; derive it from child bounds only if that rule is established by the integration.

Render RDF terms with an RDF/SPARQL-aware serializer or validated bindings. Do not concatenate unchecked production strings into SPARQL. Keep `BIND` clauses inside `WHERE`; `INSERT DATA` is only suitable for concrete triples with no variables or `BIND` expressions.

## 5. Ingest one production run

1. Resolve the workflow, input laminate, equipment, sensors, properties, and actual plans. Persist the run IRI, root instance IRI, and production-to-RDF identifier map.
2. Collect completion events. Render and submit the specific action or sensor query once per real execution, using its actual interval and the shared run IRI. Every current activity template inserts `wild:done` and an end time, so use it for completed events. These templates do not implement activity-start, failure, cancellation, or a transition from an existing activity state.
3. Insert dataset metadata once the acquisition's file is available. Submit `insert-dataset.rq` once per distinct dataset with the exact producing sensor activity-instance IRI. Several files may reference one observation. A shared multi-sensor file needs a deliberately defined provenance mapping; the current dataset template binds one generating activity per execution.
4. Record each completed composite with its specific template and actual interval. Record `heatAndObserve` after its two children, `inspection` after its four observations, and the two main branches once their children complete.
5. After successful run completion and reconciliation of the executed workflow, submit `finalize-run.rq` with the shared run IRI, root instance IRI, material IRIs, and actual run/root times. It creates the run and root records if absent, replaces their existing states with `wild:done`, and records the part's derivation from the laminate through the run. It does not finalize child instances or validate that they exist.
6. Query the resulting graph and reconcile it with the production event log. Dataset metadata that arrives later can be inserted after finalization with the original producing activity IRI; it does not require another finalization request.

The model's physical order is:

```text
stampFormingFlow: parallel
  gripAndObserve: parallel
    gripping
    observeGripperAngle1..8, observeGripperForce1..8, observeGripperExtension1..8
  manufactureAndObserve: sequential
    load -> moveToOven -> heatAndObserve -> moveToPress -> pressing
         -> moveToInspection -> inspection -> moveToUnload -> unload
    heatAndObserve: heating || observeLaminateSurfaceTemperature1
    inspection: observeLaminateShape1 -> observeLaminateShape2
                -> observeLaminateShape3 -> observeLaminateShape4
```

Database insertion order need not reproduce wall-clock execution order. Delayed events may be inserted later while retaining their actual timestamps. Parallel nodes permit overlap but do not imply identical start or end times. Do not execute files alphabetically as a substitute for interpreting this model.

There is no dedicated run-start template in this directory. For ingestion after completion, finalization supplies the run and root descriptions. If a live run must be visible earlier, register those resources separately as active, reusing the same identifiers at finalization. Likewise, if other code has already created active child instances, adapt their completion updates to replace the old states; the current action and sensor templates only add `wild:done`.

## 6. Example: render a temperature acquisition and its dataset

The following illustrates an input record after the integration has resolved identifiers. These are example facts, not values to reuse in production:

```json
{
  "production_run_id": "run-20261030-001",
  "workflow_instance_iri": "http://purl.org/for/workflow/instance/11111111-1111-4111-8111-111111111111#it",
  "root_activity_instance_iri": "http://purl.org/for/activity/instance/33333333-3333-4333-8333-333333333333#it",
  "production_execution_id": "pyrometer-acquisition-001",
  "model_activity_iri": "http://purl.org/for/activity#observeLaminateSurfaceTemperature1",
  "activity_instance_iri": "http://purl.org/for/activity/instance/22222222-2222-4222-8222-222222222222#it",
  "started_at": "2026-10-30T10:00:00Z",
  "ended_at": "2026-10-30T10:02:34Z",
  "sensor_iri": "http://purl.org/for/fofa/sensor/pyrometer/1#it",
  "observed_entity_iri": "http://purl.org/for/laminat#1",
  "observed_property_iri": "http://purl.org/for/fofa/property/temperature/surface#it",
  "dataset_iri": "http://purl.org/for/vpd/dataset/44444444-4444-4444-8444-444444444444#it",
  "dataset_download_url": "https://example.org/production/run-20261030-001/temperature.csv"
}
```

Select `sensor-activities/insert-observe-laminate-surface-temperature-1.rq`. Keep its prefixes and `INSERT` block; replace its `WHERE` block with:

```sparql
WHERE
{
    BIND(<http://purl.org/for/activity/instance/22222222-2222-4222-8222-222222222222#it> AS ?sensor_activity_instance)
    BIND("2026-10-30T10:00:00Z"^^xsd:dateTime AS ?start_time)
    BIND("2026-10-30T10:02:34Z"^^xsd:dateTime AS ?end_time)
    BIND(activity:observeLaminateSurfaceTemperature1 AS ?activity)
    BIND(<http://purl.org/for/workflow/instance/11111111-1111-4111-8111-111111111111#it> AS ?workflow_instance)
    BIND(<http://purl.org/for/fofa/sensor/pyrometer/1#it> AS ?sensor)
    BIND(<http://purl.org/for/laminat#1> AS ?observed_entity)
    BIND(<http://purl.org/for/fofa/property/temperature/surface#it> AS ?observed_property_of_entity)
}
```

Then render `insert-dataset.rq`: bind `?dataset` to the input's `dataset_iri`, `?sensor_activity_instance` to the same `activity_instance_iri` used above, and `?dataset_download_url` to the actual file URL. Do not bind the generator to the sensor device, model activity, or workflow instance. The provenance path is:

```text
catalog --dcat:dataset--> dataset --prov:wasGeneratedBy--> observation instance
observation instance --wild:inWorkflowInstance--> workflow instance
observation instance --wild:activityInstanceOf--> model activity
observation instance --sosa:madeBySensor--> sensor device
```

Use the same `workflow_instance_iri`, `root_activity_instance_iri`, and input laminate IRI when eventually rendering `finalize-run.rq`. Finalization also needs the output part IRI and the actual complete run/root intervals; this acquisition record alone is insufficient to finalize a run.

## 7. Submit the rendered update

Use the configured VPD SPARQL Update endpoint. The repository's default local endpoints are:

| Purpose | Endpoint |
| --- | --- |
| Write metadata | `http://localhost:3030/vpd/update` |
| Query metadata | `http://localhost:3030/vpd/sparql` |

Save a fully rendered query to a separate file and submit it, for example from the repository root:

```bash
curl --fail-with-body \
  -X POST 'http://localhost:3030/vpd/update' \
  -H 'Content-Type: application/sparql-update' \
  --data-binary @/tmp/rendered-temperature.rq
```

Use the deployment's configured authentication when required. The UI's [SPARQL service](../../../src/services/sparql.ts) instead posts a form-encoded `update` field; that is another supported request shape. These templates target the default graph of the `vpd` Fuseki dataset. A deployment using named graphs requires explicit adaptation of both updates and verification queries. The physical IRIs do not change the HTTP endpoint or choose a graph.

Treat an HTTP success as acceptance of the update, not validation of manufacturing facts, referenced resources, or workflow completeness. SPARQL updates do not return the inserted identifiers: mint and persist them before submission.

## 8. Verify and reconcile

Replace the example run IRI below, then submit this query to the query endpoint. It lists activity records and any datasets attributed to them:

```sparql
PREFIX wild: <http://purl.org/wild/vocab#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX sosa: <http://www.w3.org/ns/sosa/>
PREFIX dcat: <http://www.w3.org/ns/dcat#>

SELECT ?instance ?modelActivity ?state ?start ?end
       ?sensor ?observedEntity ?property ?dataset ?downloadURL
WHERE {
    BIND(<http://purl.org/for/workflow/instance/11111111-1111-4111-8111-111111111111#it> AS ?run)
    ?instance wild:inWorkflowInstance ?run ;
              wild:activityInstanceOf ?modelActivity .
    OPTIONAL { ?instance wild:hasState ?state }
    OPTIONAL { ?instance prov:startedAtTime ?start }
    OPTIONAL { ?instance prov:endedAtTime ?end }
    OPTIONAL { ?instance sosa:madeBySensor ?sensor }
    OPTIONAL { ?instance sosa:hasFeatureOfInterest ?observedEntity }
    OPTIONAL { ?instance sosa:observedProperty ?property }
    OPTIONAL {
        ?dataset prov:wasGeneratedBy ?instance .
        OPTIONAL { ?dataset dcat:distribution/dcat:downloadURL ?downloadURL }
    }
}
ORDER BY ?start ?modelActivity
```

Check the distinct activity-instance IRIs against the expected execution log; multiple datasets can produce several result rows per activity. Verify model membership, the shared run IRI, actual time intervals, correct equipment and gripper numbers, and applied plans. For completed records, ensure that `wild:done` is the only state. Check that each dataset is a member of `http://purl.org/for/vpd#it` and points to its exact producing activity instance. Finally verify the part-to-laminate derivation, including `prov:hadActivity` pointing to this run.

## 9. Retries, corrections, and limits

- Mint new activity IRIs for new physical executions. Reuse persisted IRIs when reconciling delivery of the same event. Do not turn a transport retry into a second recorded execution.
- The current templates are not fully idempotent. Replaying a parameterized machine update creates another blank-node association; replaying a dataset update creates another distribution; replaying finalization creates another derivation. Reusing named IRIs alone does not prevent these additions.
- Track delivery status and reconcile uncertain outcomes by querying the store before resending. An existence check is not a concurrency lock. Integrations requiring automatic concurrent retries need a deliberate idempotency strategy, such as stable identifiers for auxiliary resources or conditional updates.
- Ordinary `INSERT` updates add facts; they do not replace old timestamps, plans, URLs, or states. Correct existing records using a targeted `DELETE/INSERT WHERE` based on their known identifiers. Finalization replaces run/root states only; it does not remove previous timestamps or derivations.
- Failed, aborted, incomplete, or skipped steps require explicit handling outside these completion templates. Do not invent successful executions merely to reach the expected activity count, and do not finalize an unsuccessful run as done.
- The templates do not upload measurement files, describe new equipment or material in full, capture every production parameter, or enforce the workflow. Record additional required metadata through an explicit extension using the same identifiers.

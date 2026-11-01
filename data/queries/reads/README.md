# Preparing a manufacturing run

The manufacturing system starts with the scheduled workflow instance IRI. Replace
`<workflow/instance/1#it>` in each query's `VALUES ?workflow_instance` clause with
that IRI. These are SPARQL 1.1 queries over the default graph. Load the initialized
run and reference data into that graph (or configure an equivalent union default
graph). Do not load both before/after snapshots of the same run together.

Required sources are [run-view-after-ui.ttl](../../run-view-after-ui.ttl),
[workflow.ttl](../../workflow.ttl), [plan.ttl](../../plan.ttl),
[system.ttl](../../system.ttl), and [properties.ttl](../../properties.ttl).
The run snapshot holds plan links; the plan descriptions now live in `plan.ttl`.

## Queries and update bindings

| Query | Information retrieved | Used for |
| --- | --- | --- |
| [get-workflow-instance.rq](get-workflow-instance.rq) | Workflow model/state, input laminate, root activity model and instance/state | Check the scheduled run and fill `?workflow_instance`; identify the root and the laminate used in observations. |
| [get-activity-instances.rq](get-activity-instances.rq) | Existing activity instances, model activities, model types, states, optional plans and implementing systems | Fill `?activity_instance`, `?activity`, `?initialization_plan`, `?implementing_system`; retain this map for runtime events. |
| [get-workflow-structure.rq](get-workflow-structure.rq) | Parent/child model relationships, parallel/sequential types, immediate list successors | Execute the workflow hierarchy and decide when composites have finished. Join to the instance map by model activity. |
| [get-initialization-plans.rq](get-initialization-plans.rq) | RDF graph of applied plans, including nested quantities, units, component/activity references, vectors and closing-step lists | Configure gripping, heating and pressing before execution and retain the plan IRIs for provenance. |
| [get-observation-bindings.rq](get-observation-bindings.rq) | Existing sensor activity instances, activity models, states, sensors, features of interest and properties | Fill `?sensor_activity_instance`, `?activity`, `?sensor`, `?observed_entity`, `?observed_property_of_entity` in `template-insert-observation.rq`. |

For the provided initialized run, expect one workflow row, 43 activity rows,
42 parent/child rows, three plan resources, and 29 observation rows. The activity
map includes composites, the root and observations; it is not exclusively a list
of actuator activities. The observation query gives the subset to complete with
the sensor template. Use the machine template without initialization for the
remaining activities without plans, and the dedicated gripping/heating/pressing
updates for those with plans.

Read states rather than assuming readiness. All example states are
`wild:initialized`; the completion updates match only initialized instances.
These read queries do not reserve a run or decide whether a physical activity is
ready. The controller applies the hierarchy and its own execution conditions.
SPARQL row order is not workflow execution order: follow `next_activity` for
sequential parents; children of parallel parents may execute concurrently.
Compare the hierarchy with the instance map to detect absent initialized instances.

The three parameterized updates already look up the applied plan and implementing
system in their `WHERE` clauses. Supply their existing activity/workflow IRIs and
actual timestamps; ensure the plan links and workflow model are available to those
updates. Optional system bindings in the activity map are intentionally absent
for activities whose model declares no executor.

## Observation configuration gap

The current workflow/system graphs do not link observation model activities to
sensors, observed properties or features of interest. Those bindings cannot all
be discovered from the scheduled run IRI alone. The observation query therefore
contains an explicit demonstrator `VALUES` mapping: eight angle, force and
extension sensors observe their respective grippers; the pyrometer observes the
run's laminate temperature; four successive shape acquisitions use camera 1 and
observe that same laminate. This mapping must agree with the controller's actual
equipment configuration. It is configuration, not evidence of an execution.

The query checks sensor/property registration against `system.ttl` and
`properties.ttl`. Missing registrations produce missing rows; reconcile the 29
expected activities with the activity map. The query uses the current
`http://purl.org/for/sensor/...`, `http://purl.org/for/system/...` and
`http://purl.org/for/property#...` IRIs, not the obsolete `/fofa/` namespaces.
All four camera activities share one sensor; their numeric suffixes identify
acquisitions, not cameras. A future explicit activity-to-observation configuration
in RDF could replace the mapping table.

## Values supplied during execution

The initialized graph cannot provide future execution facts:

- Record actual `?start_time` and `?end_time` for each activity and for the full
  workflow. Use `xsd:dateTime` values with timezones, not template example dates.
- Allocate a unique `?dataset` IRI for each produced dataset, retain its exact
  `?sensor_activity_instance` from the observation map, and supply the actual
  `?dataset_download_url` when the file is available. These fill
  `template-insert-dataset.rq`; no read query can discover future dataset IDs or URLs.
- Keep the instance map through the run; reuse its IRIs in completion updates and
  dataset provenance rather than allocating new activity instances.

Complete child and composite activities individually, then use
`update-workflow-instance.rq` with the known run IRI and its actual overall
interval. It only changes the workflow state/times; it does not check child
completion, complete the root automatically, or create output-part metadata.

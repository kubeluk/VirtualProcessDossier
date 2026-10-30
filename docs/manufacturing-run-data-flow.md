# Manufacturing run data flow: working design notes

## Purpose

The VPD should support both prospective information (what a person intends to make and which parameters to use) and retrospective information (what the manufacturing system actually did and recorded). The UI and manufacturing system write complementary facts into the same knowledge graph. A stable identifier for each planned job and executed run connects those facts.

This is a conceptual proposal, not yet an agreed integration contract.

## Proposed flow

1. **Prepare in the UI.** A person creates or selects the specific input sheet, records its material properties and lineage, and prepares parameter plans for the relevant machines or activities. A planned run or work order binds the intended sheet, workflow model, and exact plan versions under one URI.
2. **Start at the manufacturing site.** The manufacturing system receives the work order URI, retrieves its inputs through SPARQL, and checks that it can execute them. It creates a unique workflow instance URI for the actual run and records the sheet and plan versions it accepted. These may differ from what was originally intended; both should remain visible.
3. **Record execution.** The manufacturing system creates activity instances linked to the run and workflow model. It records machine associations, start and end times, status, actual settings, and sensor observations at the most relevant activity level. Planned setpoints and observed or applied values remain distinct.
4. **Publish results.** The system stores files, registers them as `dcat:Dataset` resources with `dcat:Distribution` download or access URLs, and links each dataset to its producing activity or the whole run. The resulting physical part links to the run that produced it and to the sheet from which it was derived.
5. **Enrich in the UI.** A person can add context, corrections, and links to the existing run without creating a second execution record. Future plans are separate resources that may refer to lessons from earlier runs.

## Graph relationships

| Fact | Proposed relationship |
| --- | --- |
| Run follows a workflow model | `run wild:workflowInstanceOf model` |
| Activity belongs to a run and instantiates a model activity | `activity wild:inWorkflowInstance run`; `activity wild:activityInstanceOf modelActivity` |
| Run or activity consumed a particular sheet | `run prov:used sheet`, or `activity prov:used sheet` when the consuming step is known |
| A machine followed a plan during an activity | `activity prov:qualifiedAssociation [ prov:agent machine; prov:hadPlan planVersion ]` |
| Dataset was produced during execution | `dataset prov:wasGeneratedBy activity` (or `run` for a run-wide dataset) |
| Dataset is discoverable and its file is accessible | `catalog dcat:dataset dataset`; `dataset dcat:distribution [ dcat:downloadURL fileURL ]` |
| Part was produced from the sheet | `part prov:wasGeneratedBy run`; `part prov:wasDerivedFrom sheet` |

The planned run or work order needs a small project vocabulary for its intended inputs and plans. It should not assert `prov:used` before execution: that relation is reserved here for an input actually used by an activity. The work order and executed run should have separate URIs and an explicit link between them. The exact predicate for that link remains to be chosen.

Sensor files can be cataloged as datasets without creating one RDF observation per sample. If observation-level queries are needed later, model SOSA observations with their sensor, observed property, feature of interest, time, and result, and relate them to the relevant run activity and dataset.

## Ownership and synchronization

| Resource or fact | Proposed owner |
| --- | --- |
| Sheet identity and material description | UI or the authoritative material system |
| Intended workflow, sheet, and parameter plan | UI/work order |
| Run URI, activity instances, actual inputs, timing, state, machine events | Manufacturing system |
| Sensor files and their catalog records | Manufacturing system |
| Human annotations and later contextual links | UI |

Agree on URI rules and who creates each resource before integrating the writers. The manufacturing system should reuse the same run and dataset URIs when retrying an update. Plan versions used for a run should be immutable or captured as snapshots; subsequent edits must not rewrite the historical intention. File storage and SPARQL updates cannot be one ordinary transaction, so registration needs a recoverable sequence: store the file, register its distribution, and retry incomplete steps without duplicating records. A run also needs states for planned, active, completed, and failed execution; datasets may arrive after the run ends.

## Current repository observations

- Seed data already has workflow models, workflow/activity instances, plans, physical parts, and catalog datasets. For example, `data/runs.ttl` links activity instances to machine plans through `prov:qualifiedAssociation` and `prov:hadPlan`.
- The UI's `addWorkflowRun` in `src/stores/workflow.ts` creates a run and all its activity instances immediately in `wild:done` state. That path cannot represent an active run as written.
- Another plan editing path in `src/stores/workflow.ts` reads and writes `prov:used` between an activity instance and a plan. Its meaning and queries need alignment with the seeded `prov:hadPlan` representation.
- `src/stores/material.ts` currently reads material lineage but has no material creation path.
- Dataset links are inconsistent: seeded catalog data uses `prov:wasGeneratedBy`, while the run view also reads `dcterms:isPartOf` links from datasets to observation/activity instances. One production convention should drive both writing and reading.

## Open decisions and questions

1. **How is work selected?** Does the manufacturing system receive a work order URI from an operator or queue, or query the store for the next approved job? What makes a job ready to execute?
2. **What identifies the input?** Is the UI describing a material type, batch, individual sheet, or all three? Which system verifies the physical sheet actually loaded?
3. **Who owns plan approval and revisions?** Can plans change after scheduling? How are immutable versions or snapshots created, and how does the machine acknowledge the exact version received?
4. **Where do actual values live?** Which parameters need both a requested setpoint and an applied or measured value? What time resolution is needed for those values?
5. **What is an execution attempt?** If a job is aborted and restarted, is that one work order with two run URIs? What event marks a run complete or failed?
6. **What is the dataset granularity?** One file per sensor, machine, activity, or run? How are datasets spanning activities linked, and are individual SOSA observations needed in RDF?
7. **How are identifiers allocated?** Which system creates work order, run, activity, part, and dataset URIs? What stable source ID makes retries idempotent?
8. **What may the UI change after execution?** Which facts are authoritative machine records, which are human annotations, and how are corrections or disputed values represented without erasing history?
9. **How is publication recovered?** How are failed uploads, missing files, partial SPARQL updates, and late sensor datasets detected and repaired?
10. **Which provenance pattern is canonical?** Should machine plans always use qualified associations, and should datasets use `prov:wasGeneratedBy` for the producing activity? The seed and UI should follow the same pattern.

## References

- [PROV-O](https://www.w3.org/TR/prov-o/) for activities, usage, generation, derivation, and plans.
- [SOSA/SSN](https://www.w3.org/TR/vocab-ssn-2023/) for sensor observations when observation-level RDF is required.
- [DCAT 3](https://www.w3.org/TR/vocab-dcat/) for dataset catalog entries and distributions.

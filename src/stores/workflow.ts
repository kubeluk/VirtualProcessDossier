import { defineStore } from 'pinia'
import { querySparql, updateSparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface WorkflowStepDataset {
  uri: string
  title: string | null
  description: string | null
}

// ---------------------------------------------------------------------------
// WorkflowModel types
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
  uri: string
  title: string
  description: string | null
  issued: string | null
}

export interface WorkflowStep {
  uri: string
  title: string | null
  description: string | null
  type: string | null
}

export interface WorkflowDetail {
  uri: string
  title: string
  description: string | null
  issued: string | null
  steps: WorkflowStep[]
}

// ---------------------------------------------------------------------------
// WorkflowInstance / Run types
// ---------------------------------------------------------------------------

export interface WorkflowInstanceSummary {
  uri: string
  title: string | null
  description: string | null
  state: string | null  // 'active' | 'done' | null
  started: string | null
}

export interface RunActivityInstance {
  uri: string
  title: string | null
  modelActivityUri: string
  datasets: WorkflowStepDataset[]
}

export interface RunStep {
  uri: string           // model step URI (for title, type, step number)
  title: string | null
  description: string | null
  type: string | null
  activityInstances: RunActivityInstance[]
}

export interface RunDetail {
  uri: string           // workflow instance URI
  title: string | null
  description: string | null
  state: string | null
  started: string | null
  modelUri: string
  modelTitle: string | null
  steps: RunStep[]
  crossCuttingDatasets: WorkflowStepDataset[]
}

// ---------------------------------------------------------------------------
// Step-picker option (used by AddDatasetModal)
// ---------------------------------------------------------------------------

export interface WorkflowStepOption {
  uri: string
  label: string
  workflowUri: string
  workflowTitle: string | null
  workflowInstanceUri: string | null
  parentStepUri: string | null
  parentStepTitle: string | null
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkflowStore = defineStore('workflow', () => {
  const graphStore = useGraphStore()

  // ── WorkflowModel queries ────────────────────────────────────────────────

  async function fetchWorkflows(): Promise<WorkflowSummary[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?workflow ?title ?description ?issued WHERE {
        ?workflow a wild:WorkflowModel .
        OPTIONAL { ?workflow dcterms:title ?title }
        OPTIONAL { ?workflow dcterms:description ?description }
        OPTIONAL { ?workflow dcterms:issued ?issued }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.workflow.value,
      title: b.title?.value ?? b.workflow.value,
      description: b.description?.value ?? null,
      issued: b.issued?.value ?? null,
    }))
  }

  async function fetchWorkflow(uri: string): Promise<WorkflowDetail | null> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?wfTitle ?wfDesc ?wfIssued
             ?step ?stepTitle ?stepDesc ?stepType
      WHERE {
        BIND(<${uri}> AS ?workflow)
        ?workflow dcterms:title ?wfTitle .
        OPTIONAL { ?workflow dcterms:description ?wfDesc }
        OPTIONAL { ?workflow dcterms:issued ?wfIssued }
        OPTIONAL {
          ?workflow wild:hasBehaviour ?root .
          ?root wild:hasChildActivities/rdf:rest*/rdf:first ?step .
          OPTIONAL { ?step dcterms:title ?stepTitle }
          OPTIONAL { ?step dcterms:description ?stepDesc }
          OPTIONAL {
            ?step a ?stepType .
            FILTER(STRSTARTS(STR(?stepType), 'http://purl.org/wild/vocab#'))
          }
        }
      }
    `
    const results = await querySparql(graphStore.endpoint, query)
    if (results.results.bindings.length === 0) return null

    const first = results.results.bindings[0]
    const stepsMap = new Map<string, WorkflowStep>()

    for (const b of results.results.bindings) {
      if (!b.step) continue
      const stepUri = b.step.value
      if (!stepsMap.has(stepUri)) {
        const rawType = b.stepType?.value ?? null
        stepsMap.set(stepUri, {
          uri: stepUri,
          title: b.stepTitle?.value ?? null,
          description: b.stepDesc?.value ?? null,
          type: rawType ? rawType.replace('http://purl.org/wild/vocab#', '') : null,
        })
      }
    }

    const steps = [...stepsMap.values()].sort((a, b) => {
      const nA = parseInt(a.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      const nB = parseInt(b.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      return nA - nB
    })

    return {
      uri,
      title: first.wfTitle.value,
      description: first.wfDesc?.value ?? null,
      issued: first.wfIssued?.value ?? null,
      steps,
    }
  }

  // ── WorkflowInstance / Run queries ───────────────────────────────────────

  async function fetchWorkflowInstances(modelUri: string): Promise<WorkflowInstanceSummary[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov:    <http://www.w3.org/ns/prov#>

      SELECT ?instance ?title ?description ?state ?started WHERE {
        ?instance a wild:WorkflowInstance ;
                  wild:workflowInstanceOf <${modelUri}> .
        OPTIONAL { ?instance dcterms:title ?title }
        OPTIONAL { ?instance dcterms:description ?description }
        OPTIONAL { ?instance wild:hasState ?state }
        OPTIONAL { ?instance prov:startedAtTime ?started }
      }
      ORDER BY DESC(?started)
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.instance.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
      state: b.state?.value?.replace('http://purl.org/wild/vocab#', '') ?? null,
      started: b.started?.value ?? null,
    }))
  }

  async function fetchRun(uri: string): Promise<RunDetail | null> {
    // Query 1: run metadata + model step skeleton
    const mainQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX prov:    <http://www.w3.org/ns/prov#>

      SELECT ?instTitle ?instDesc ?instState ?instStarted
             ?modelUri ?modelTitle
             ?step ?stepTitle ?stepDesc ?stepType
      WHERE {
        BIND(<${uri}> AS ?instance)
        ?instance a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?modelUri .
        OPTIONAL { ?instance dcterms:title ?instTitle }
        OPTIONAL { ?instance dcterms:description ?instDesc }
        OPTIONAL { ?instance wild:hasState ?instState }
        OPTIONAL { ?instance prov:startedAtTime ?instStarted }
        OPTIONAL { ?modelUri dcterms:title ?modelTitle }
        OPTIONAL {
          ?modelUri wild:hasBehaviour ?root .
          ?root wild:hasChildActivities/rdf:rest*/rdf:first ?step .
          OPTIONAL { ?step dcterms:title ?stepTitle }
          OPTIONAL { ?step dcterms:description ?stepDesc }
          OPTIONAL {
            ?step a ?stepType .
            FILTER(STRSTARTS(STR(?stepType), 'http://purl.org/wild/vocab#'))
          }
        }
      }
    `

    // Query 2: activity instances + datasets for this run.
    // Uses a literal URI (not BIND) to avoid the Jena BIND-in-UNION issue.
    // Also resolves parent step for leaf activities under parallel steps.
    const activitiesQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?actInst ?actInstTitle ?modelActivity ?parentStep ?dataset ?datasetTitle ?datasetDesc
      WHERE {
        ?actInst wild:inWorkflowInstance <${uri}> ;
                 wild:activityInstanceOf ?modelActivity .
        OPTIONAL { ?actInst dcterms:title ?actInstTitle }
        OPTIONAL {
          ?parentStep wild:hasChildActivities/rdf:rest*/rdf:first ?modelActivity .
        }
        OPTIONAL {
          ?dataset dcterms:isPartOf ?actInst .
          OPTIONAL { ?dataset dcterms:title ?datasetTitle }
          OPTIONAL { ?dataset dcterms:description ?datasetDesc }
        }
      }
    `

    // Query 3: cross-cutting datasets linked directly to this run
    const crossCuttingQuery = `
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?dataset ?datasetTitle ?datasetDesc WHERE {
        ?dataset dcterms:isPartOf <${uri}> .
        OPTIONAL { ?dataset dcterms:title ?datasetTitle }
        OPTIONAL { ?dataset dcterms:description ?datasetDesc }
      }
    `

    const [mainResults, activitiesResults, crossResults] = await Promise.all([
      querySparql(graphStore.endpoint, mainQuery),
      querySparql(graphStore.endpoint, activitiesQuery),
      querySparql(graphStore.endpoint, crossCuttingQuery),
    ])

    if (mainResults.results.bindings.length === 0) return null
    const first = mainResults.results.bindings[0]

    // Build step skeleton from main query
    const stepsMap = new Map<string, RunStep>()
    for (const b of mainResults.results.bindings) {
      if (!b.step) continue
      const stepUri = b.step.value
      if (!stepsMap.has(stepUri)) {
        const rawType = b.stepType?.value ?? null
        stepsMap.set(stepUri, {
          uri: stepUri,
          title: b.stepTitle?.value ?? null,
          description: b.stepDesc?.value ?? null,
          type: rawType ? rawType.replace('http://purl.org/wild/vocab#', '') : null,
          activityInstances: [],
        })
      }
    }

    // Build activity instance map (deduplicate datasets per instance)
    const actInstMap = new Map<string, RunActivityInstance>()
    for (const b of activitiesResults.results.bindings) {
      const actUri = b.actInst.value
      if (!actInstMap.has(actUri)) {
        actInstMap.set(actUri, {
          uri: actUri,
          title: b.actInstTitle?.value ?? null,
          modelActivityUri: b.modelActivity.value,
          datasets: [],
        })
      }
      if (b.dataset) {
        const act = actInstMap.get(actUri)!
        if (!act.datasets.some((d) => d.uri === b.dataset!.value)) {
          act.datasets.push({
            uri: b.dataset.value,
            title: b.datasetTitle?.value ?? null,
            description: b.datasetDesc?.value ?? null,
          })
        }
      }
    }

    // Attach activity instances to their parent step (deduplicating per step)
    const attachedActInsts = new Set<string>()
    for (const b of activitiesResults.results.bindings) {
      const actUri = b.actInst.value
      if (attachedActInsts.has(actUri)) continue
      attachedActInsts.add(actUri)

      const actInst = actInstMap.get(actUri)!
      // If the model activity is a leaf under a parallel step, attach to the parallel step
      const targetStepUri = b.parentStep?.value ?? b.modelActivity.value
      if (stepsMap.has(targetStepUri)) {
        stepsMap.get(targetStepUri)!.activityInstances.push(actInst)
      }
    }

    const steps = [...stepsMap.values()].sort((a, b) => {
      const nA = parseInt(a.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      const nB = parseInt(b.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      return nA - nB
    })

    const crossCuttingDatasets = crossResults.results.bindings.map((b) => ({
      uri: b.dataset.value,
      title: b.datasetTitle?.value ?? null,
      description: b.datasetDesc?.value ?? null,
    }))

    return {
      uri,
      title: first.instTitle?.value ?? null,
      description: first.instDesc?.value ?? null,
      state: first.instState?.value?.replace('http://purl.org/wild/vocab#', '') ?? null,
      started: first.instStarted?.value ?? null,
      modelUri: first.modelUri.value,
      modelTitle: first.modelTitle?.value ?? null,
      steps,
      crossCuttingDatasets,
    }
  }

  async function updateWorkflowInstance(
    instanceUri: string,
    title: string,
    description: string,
  ): Promise<void> {
    const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const descTriple = description.trim()
      ? `<${instanceUri}> dcterms:description "${escapedDesc}"@en .`
      : ''
    const update = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      DELETE {
        <${instanceUri}> dcterms:title ?oldTitle .
        <${instanceUri}> dcterms:description ?oldDesc .
      }
      INSERT {
        <${instanceUri}> dcterms:title "${escapedTitle}"@en .
        ${descTriple}
      }
      WHERE {
        OPTIONAL { <${instanceUri}> dcterms:title ?oldTitle }
        OPTIONAL { <${instanceUri}> dcterms:description ?oldDesc }
      }
    `
    await updateSparql(graphStore.updateEndpoint, update)
  }

  // ── Step-picker options (for AddDatasetModal) ────────────────────────────
  // Returns model activity URIs so new observations can set activityInstanceOf correctly.
  // When instanceUri is provided the results are already scoped to that run's model;
  // when omitted all models are returned (used when the modal is opened globally).

  async function fetchWorkflowStepOptions(instanceUri?: string): Promise<WorkflowStepOption[]> {
    const instanceJoin = instanceUri
      ? `BIND(<${instanceUri}> AS ?wfInst) ?wfInst wild:workflowInstanceOf ?wfModel .`
      : `?wfModel a wild:WorkflowModel .
        OPTIONAL {
          ?wfInst a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?wfModel .
        }`

    const stepQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?step ?stepTitle ?stepType ?wfModel ?wfTitle ?wfInst WHERE {
        ${instanceJoin}
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        ?wfModel wild:hasBehaviour ?root .
        ?root wild:hasChildActivities/rdf:rest*/rdf:first ?step .
        OPTIONAL { ?step dcterms:title ?stepTitle }
        OPTIONAL {
          ?step a ?stepType .
          FILTER(STRSTARTS(STR(?stepType), 'http://purl.org/wild/vocab#'))
        }
      }
      ORDER BY ?wfTitle ?stepTitle
    `

    const leafQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?leaf ?leafTitle ?parentStep ?parentTitle ?wfModel ?wfTitle ?wfInst WHERE {
        ${instanceJoin}
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        ?wfModel wild:hasBehaviour ?root .
        ?root wild:hasChildActivities/rdf:rest*/rdf:first ?parentStep .
        ?parentStep a wild:ParallelActivity ;
                    wild:hasChildActivities/rdf:rest*/rdf:first ?leaf .
        OPTIONAL { ?parentStep dcterms:title ?parentTitle }
        OPTIONAL { ?leaf dcterms:title ?leafTitle }
      }
      ORDER BY ?wfTitle ?parentTitle ?leafTitle
    `

    const [stepResults, leafResults] = await Promise.all([
      querySparql(graphStore.endpoint, stepQuery),
      querySparql(graphStore.endpoint, leafQuery),
    ])

    const workflowsSeen = new Map<string, { title: string | null; instanceUri: string | null }>()
    const options: WorkflowStepOption[] = []

    for (const b of stepResults.results.bindings) {
      const wfUri = b.wfModel.value
      if (!workflowsSeen.has(wfUri)) {
        workflowsSeen.set(wfUri, {
          title: b.wfTitle?.value ?? null,
          instanceUri: b.wfInst?.value ?? null,
        })
      }
      const stepType = b.stepType?.value?.replace('http://purl.org/wild/vocab#', '') ?? null
      if (stepType === 'ParallelActivity') continue
      options.push({
        uri: b.step.value,
        label: b.stepTitle?.value ?? b.step.value,
        workflowUri: wfUri,
        workflowTitle: b.wfTitle?.value ?? null,
        workflowInstanceUri: b.wfInst?.value ?? null,
        parentStepUri: null,
        parentStepTitle: null,
      })
    }

    for (const b of leafResults.results.bindings) {
      const wfUri = b.wfModel.value
      if (!workflowsSeen.has(wfUri)) {
        workflowsSeen.set(wfUri, {
          title: b.wfTitle?.value ?? null,
          instanceUri: b.wfInst?.value ?? null,
        })
      }
      options.push({
        uri: b.leaf.value,
        label: b.leafTitle?.value ?? b.leaf.value,
        workflowUri: wfUri,
        workflowTitle: b.wfTitle?.value ?? null,
        workflowInstanceUri: b.wfInst?.value ?? null,
        parentStepUri: b.parentStep?.value ?? null,
        parentStepTitle: b.parentTitle?.value ?? null,
      })
    }

    const fullWorkflowOptions: WorkflowStepOption[] = [...workflowsSeen.entries()].map(
      ([uri, meta]) => ({
        uri,
        label: 'Full workflow run (cross-cutting)',
        workflowUri: uri,
        workflowTitle: meta.title,
        workflowInstanceUri: meta.instanceUri,
        parentStepUri: null,
        parentStepTitle: null,
      }),
    )

    return [...fullWorkflowOptions, ...options]
  }

  return {
    fetchWorkflows,
    fetchWorkflow,
    fetchWorkflowInstances,
    fetchRun,
    updateWorkflowInstance,
    fetchWorkflowStepOptions,
  }
})

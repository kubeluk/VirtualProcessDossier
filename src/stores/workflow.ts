import { defineStore } from 'pinia'
import { querySparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

export interface WorkflowStepOption {
  uri: string
  label: string
  workflowUri: string
  workflowTitle: string | null
  workflowInstanceUri: string | null
  parentStepUri: string | null
  parentStepTitle: string | null
}

export interface WorkflowSummary {
  uri: string
  title: string
  description: string | null
  issued: string | null
}

export interface WorkflowStepDataset {
  uri: string
  title: string | null
  description: string | null
}

export interface WorkflowStep {
  uri: string
  title: string | null
  description: string | null
  type: string | null
  datasets: WorkflowStepDataset[]
}

export interface WorkflowDetail {
  uri: string
  title: string
  description: string | null
  issued: string | null
  steps: WorkflowStep[]
  crossCuttingDatasets: WorkflowStepDataset[]
}

export const useWorkflowStore = defineStore('workflow', () => {
  const graphStore = useGraphStore()

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
    // Query workflow metadata, top-level steps (via list traversal), and datasets per step
    const mainQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?wfTitle ?wfDesc ?wfIssued
             ?step ?stepTitle ?stepDesc ?stepType
             ?dataset ?datasetTitle ?datasetDesc
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
          OPTIONAL {
            {
              ?dataset dcterms:isPartOf ?step .
            }
            UNION
            {
              ?step wild:hasChildActivities/rdf:rest*/rdf:first ?leaf .
              ?dataset dcterms:isPartOf ?leaf .
            }
            OPTIONAL { ?dataset dcterms:title ?datasetTitle }
            OPTIONAL { ?dataset dcterms:description ?datasetDesc }
          }
        }
      }
    `

    // Datasets linked directly to the workflow (cross-cutting, e.g. full-line power monitoring)
    const crossCuttingQuery = `
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?dataset ?datasetTitle ?datasetDesc WHERE {
        BIND(<${uri}> AS ?workflow)
        ?dataset dcterms:isPartOf ?workflow .
        OPTIONAL { ?dataset dcterms:title ?datasetTitle }
        OPTIONAL { ?dataset dcterms:description ?datasetDesc }
      }
    `

    const [mainResults, crossResults] = await Promise.all([
      querySparql(graphStore.endpoint, mainQuery),
      querySparql(graphStore.endpoint, crossCuttingQuery),
    ])

    if (mainResults.results.bindings.length === 0) return null

    const first = mainResults.results.bindings[0]

    const stepsMap = new Map<string, WorkflowStep>()

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
          datasets: [],
        })
      }

      if (b.dataset) {
        const step = stepsMap.get(stepUri)!
        if (!step.datasets.some((d) => d.uri === b.dataset!.value)) {
          step.datasets.push({
            uri: b.dataset.value,
            title: b.datasetTitle?.value ?? null,
            description: b.datasetDesc?.value ?? null,
          })
        }
      }
    }

    // Sort steps by the "Step N:" prefix in the title
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
      title: first.wfTitle.value,
      description: first.wfDesc?.value ?? null,
      issued: first.wfIssued?.value ?? null,
      steps,
      crossCuttingDatasets,
    }
  }

  async function fetchWorkflowStepOptions(): Promise<WorkflowStepOption[]> {
    // Two separate queries avoid the Jena issue with BIND + outer-scoped variables inside UNION.
    // Query 1: top-level steps (any type) — we filter ParallelActivity in JS.
    // Query 2: leaf activities under ParallelActivity steps.
    const stepQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?step ?stepTitle ?stepType ?wfModel ?wfTitle ?wfInst WHERE {
        ?wfModel a wild:WorkflowModel .
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        OPTIONAL {
          ?wfInst a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?wfModel .
        }
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
        ?wfModel a wild:WorkflowModel .
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        OPTIONAL {
          ?wfInst a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?wfModel .
        }
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

    // Top-level non-parallel steps
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

    // Leaf activities under parallel steps
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

    // One "Full workflow" option per workflow model (prepended)
    const fullWorkflowOptions: WorkflowStepOption[] = [...workflowsSeen.entries()].map(
      ([uri, meta]) => ({
        uri,
        label: 'Full workflow (cross-cutting)',
        workflowUri: uri,
        workflowTitle: meta.title,
        workflowInstanceUri: meta.instanceUri,
        parentStepUri: null,
        parentStepTitle: null,
      }),
    )

    return [...fullWorkflowOptions, ...options]
  }

  return { fetchWorkflows, fetchWorkflow, fetchWorkflowStepOptions }
})

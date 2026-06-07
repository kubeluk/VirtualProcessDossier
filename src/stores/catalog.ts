import { defineStore } from 'pinia'
import { ref } from 'vue'
import { querySparql, updateSparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

export interface DatasetFilters {
  search?: string
  workflowRunUri?: string
  workflowModelUri?: string
}

export interface DatasetFilterOptions {
  workflowRuns: { uri: string; label: string | null }[]
  workflowModels: { uri: string; label: string | null }[]
}

export interface AddDatasetForm {
  title: string
  description: string
  downloadUrl: string
  mediaType: string
  temporalResolution: string
  workflowInstanceUri: string
}

export interface Dataset {
  uri: string
  title: string
  description: string
  distributionCount: number
}

export interface Distribution {
  downloadURL: string | null
  mediaType: string | null
  temporalResolution: string | null
}

export interface DatasetDetail extends Dataset {
  distributions: Distribution[]
}

export interface WorkflowContext {
  runUri: string
  runLabel: string | null
  workflowUri: string | null
  workflowLabel: string | null
}

export const useCatalogStore = defineStore('catalog', () => {
  const graphStore = useGraphStore()

  const datasets = ref<Dataset[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function escStr(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  async function fetchDatasets(filters?: DatasetFilters) {
    loading.value = true
    error.value = null

    const clauses: string[] = []

    if (filters?.search?.trim()) {
      const s = escStr(filters.search.trim())
      clauses.push(`FILTER(
        CONTAINS(LCASE(STR(?title)), LCASE("${s}")) ||
        CONTAINS(LCASE(STR(?description)), LCASE("${s}"))
      )`)
    }

    if (filters?.workflowRunUri) {
      clauses.push(`FILTER EXISTS { ?dataset prov:wasGeneratedBy <${filters.workflowRunUri}> . }`)
    } else if (filters?.workflowModelUri) {
      clauses.push(`FILTER EXISTS {
        ?dataset prov:wasGeneratedBy ?_run .
        ?_run wild:workflowInstanceOf <${filters.workflowModelUri}> .
      }`)
    }

    const query = `
      PREFIX dcat:    <http://www.w3.org/ns/dcat#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX wild:    <http://purl.org/wild/vocab#>

      SELECT ?dataset ?title ?description (COUNT(DISTINCT ?dist) AS ?distributionCount) WHERE {
        ?catalog a dcat:Catalog ;
                 dcat:dataset ?dataset .
        ?dataset a dcat:Dataset ;
                 dcterms:title ?title .
        OPTIONAL { ?dataset dcterms:description ?description }
        OPTIONAL { ?dataset dcat:distribution ?dist }
        ${clauses.join('\n        ')}
      }
      GROUP BY ?dataset ?title ?description
      ORDER BY ?title
    `
    try {
      const results = await querySparql(graphStore.endpoint, query)
      datasets.value = results.results.bindings.map((b) => ({
        uri: b.dataset.value,
        title: b.title.value,
        description: b.description?.value ?? '',
        distributionCount: parseInt(b.distributionCount.value),
      }))
    } catch {
      error.value = 'Failed to load datasets. Make sure the triple store is running.'
    } finally {
      loading.value = false
    }
  }

  async function fetchFilterOptions(): Promise<DatasetFilterOptions> {
    const runQuery = `
      PREFIX wild:  <http://purl.org/wild/vocab#>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?inst ?label WHERE {
        ?inst a wild:WorkflowInstance .
        ?dataset prov:wasGeneratedBy ?inst .
        OPTIONAL { ?inst rdfs:label ?label }
      }
      ORDER BY ?label
    `
    const modelQuery = `
      PREFIX wild:  <http://purl.org/wild/vocab#>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?model ?label WHERE {
        ?model a wild:WorkflowModel .
        ?dataset prov:wasGeneratedBy ?run .
        ?run wild:workflowInstanceOf ?model .
        OPTIONAL { ?model rdfs:label ?label }
      }
      ORDER BY ?label
    `
    const [runRes, modelRes] = await Promise.all([
      querySparql(graphStore.endpoint, runQuery),
      querySparql(graphStore.endpoint, modelQuery),
    ])
    return {
      workflowRuns: runRes.results.bindings.map((b) => ({
        uri: b.inst.value,
        label: b.label?.value ?? null,
      })),
      workflowModels: modelRes.results.bindings.map((b) => ({
        uri: b.model.value,
        label: b.label?.value ?? null,
      })),
    }
  }

  async function fetchDataset(uri: string): Promise<DatasetDetail | null> {
    const query = `
      PREFIX dcat:    <http://www.w3.org/ns/dcat#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?title ?description ?dist ?downloadURL ?mediaType ?temporalResolution WHERE {
        BIND(<${uri}> AS ?dataset)
        ?dataset dcterms:title ?title .
        OPTIONAL { ?dataset dcterms:description ?description }
        OPTIONAL {
          ?dataset dcat:distribution ?dist .
          OPTIONAL { ?dist dcat:downloadURL ?downloadURL }
          OPTIONAL { ?dist dcat:mediaType ?mediaType }
          OPTIONAL { ?dist dcat:temporalResolution ?temporalResolution }
        }
      }
    `
    const results = await querySparql(graphStore.endpoint, query)
    if (results.results.bindings.length === 0) return null

    const first = results.results.bindings[0]
    const distributions: Distribution[] = []

    for (const b of results.results.bindings) {
      if (b.dist) {
        distributions.push({
          downloadURL: b.downloadURL?.value ?? null,
          mediaType: b.mediaType?.value ?? null,
          temporalResolution: b.temporalResolution?.value ?? null,
        })
      }
    }

    return {
      uri,
      title: first.title.value,
      description: first.description?.value ?? '',
      distributionCount: distributions.length,
      distributions,
    }
  }

  async function fetchDatasetWorkflowContext(uri: string): Promise<WorkflowContext | null> {
    const query = `
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX wild:  <http://purl.org/wild/vocab#>
      PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>

      SELECT ?run ?runLabel ?model ?modelLabel WHERE {
        <${uri}> prov:wasGeneratedBy ?run .
        OPTIONAL { ?run rdfs:label ?runLabel }
        OPTIONAL {
          ?run wild:workflowInstanceOf ?model .
          OPTIONAL { ?model rdfs:label ?modelLabel }
        }
      }
      LIMIT 1
    `
    const results = await querySparql(graphStore.endpoint, query)
    if (results.results.bindings.length === 0) return null

    const b = results.results.bindings[0]
    return {
      runUri: b.run.value,
      runLabel: b.runLabel?.value ?? null,
      workflowUri: b.model?.value ?? null,
      workflowLabel: b.modelLabel?.value ?? null,
    }
  }

  async function addDataset(form: AddDatasetForm): Promise<string> {
    const suffix = Date.now().toString(36)
    const slug =
      form.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'dataset'

    const base = 'http://purl.org/vpd/data#'
    const datasetUri = `${base}dataset-${slug}-${suffix}`
    const catalogUri = `${base}it`

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    const datasetTriples: string[] = [
      `<${datasetUri}> a dcat:Dataset`,
      `  dcterms:title "${esc(form.title)}"`,
    ]
    if (form.description) datasetTriples.push(`  dcterms:description "${esc(form.description)}"`)
    if (form.workflowInstanceUri)
      datasetTriples.push(`  prov:wasGeneratedBy <${form.workflowInstanceUri}>`)
    if (form.downloadUrl) {
      const distLines = [`    a dcat:Distribution`, `    dcat:downloadURL <${form.downloadUrl}>`]
      if (form.mediaType) distLines.push(`    dcat:mediaType "${esc(form.mediaType)}"`)
      if (form.temporalResolution)
        distLines.push(`    dcat:temporalResolution "${esc(form.temporalResolution)}"^^xsd:duration`)
      datasetTriples.push(`  dcat:distribution [\n${distLines.join(' ;\n')}\n  ]`)
    }

    const update = `
PREFIX dcat:    <http://www.w3.org/ns/dcat#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
PREFIX prov:    <http://www.w3.org/ns/prov#>

INSERT DATA {
${datasetTriples.join(' ;\n')} .

<${catalogUri}> dcat:dataset <${datasetUri}> .
}
`
    await updateSparql(graphStore.updateEndpoint, update)
    return datasetUri
  }

  return {
    datasets,
    loading,
    error,
    fetchDatasets,
    fetchDataset,
    fetchDatasetWorkflowContext,
    fetchFilterOptions,
    addDataset,
  }
})

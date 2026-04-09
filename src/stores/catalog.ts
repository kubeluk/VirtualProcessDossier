import { defineStore } from 'pinia'
import { ref } from 'vue'
import { querySparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

export interface Dataset {
  uri: string
  title: string
  description: string
  modified: string | null
  distributionCount: number
}

export interface Distribution {
  uri: string
  title: string | null
  downloadURL: string | null
  mediaType: string | null
  byteSize: number | null
}

export interface DatasetDetail extends Dataset {
  keywords: string[]
  distributions: Distribution[]
}

export interface DatasetProvenance {
  observationUri: string
  observationTitle: string | null
  startTime: string | null
  endTime: string | null
  sensor: { uri: string; title: string | null; description: string | null } | null
  featureOfInterest: { uri: string; title: string | null; description: string | null } | null
  observedProperty: { uri: string; title: string | null; description: string | null } | null
}

export interface WorkflowContext {
  stepUri: string | null
  stepTitle: string | null
  stepDescription: string | null
  isDirectWorkflowLink: boolean
  workflowUri: string | null
  workflowTitle: string | null
}

export const useCatalogStore = defineStore('catalog', () => {
  const graphStore = useGraphStore()

  const datasets = ref<Dataset[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDatasets() {
    loading.value = true
    error.value = null
    const query = `
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?dataset ?title ?description ?modified (COUNT(?dist) AS ?distributionCount) WHERE {
        ?catalog a dcat:Catalog ;
                 dcat:dataset ?dataset .
        ?dataset a dcat:Dataset ;
                 dcterms:title ?title .
        OPTIONAL { ?dataset dcterms:description ?description }
        OPTIONAL { ?dataset dcterms:modified ?modified }
        OPTIONAL { ?dataset dcat:distribution ?dist }
      }
      GROUP BY ?dataset ?title ?description ?modified
      ORDER BY ?title
    `
    try {
      const results = await querySparql(graphStore.endpoint, query)
      datasets.value = results.results.bindings.map((b) => ({
        uri: b.dataset.value,
        title: b.title.value,
        description: b.description?.value ?? '',
        modified: b.modified?.value ?? null,
        distributionCount: parseInt(b.distributionCount.value),
      }))
    } catch {
      error.value = 'Failed to load datasets. Make sure the triple store is running.'
    } finally {
      loading.value = false
    }
  }

  async function fetchDataset(uri: string): Promise<DatasetDetail | null> {
    const query = `
      PREFIX dcat: <http://www.w3.org/ns/dcat#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?title ?description ?modified ?keyword ?dist ?distTitle ?downloadURL ?mediaType ?byteSize WHERE {
        BIND(<${uri}> AS ?dataset)
        ?dataset dcterms:title ?title .
        OPTIONAL { ?dataset dcterms:description ?description }
        OPTIONAL { ?dataset dcterms:modified ?modified }
        OPTIONAL { ?dataset dcat:keyword ?keyword }
        OPTIONAL {
          ?dataset dcat:distribution ?dist .
          OPTIONAL { ?dist dcterms:title ?distTitle }
          OPTIONAL { ?dist dcat:downloadURL ?downloadURL }
          OPTIONAL { ?dist dcat:mediaType ?mediaType }
          OPTIONAL { ?dist dcat:byteSize ?byteSize }
        }
      }
    `
    const results = await querySparql(graphStore.endpoint, query)
    if (results.results.bindings.length === 0) return null

    const first = results.results.bindings[0]
    const keywords = new Set<string>()
    const distributionsMap = new Map<string, Distribution>()

    for (const b of results.results.bindings) {
      if (b.keyword) keywords.add(b.keyword.value)
      if (b.dist) {
        distributionsMap.set(b.dist.value, {
          uri: b.dist.value,
          title: b.distTitle?.value ?? null,
          downloadURL: b.downloadURL?.value ?? null,
          mediaType: b.mediaType?.value ?? null,
          byteSize: b.byteSize ? parseFloat(b.byteSize.value) : null,
        })
      }
    }

    return {
      uri,
      title: first.title.value,
      description: first.description?.value ?? '',
      modified: first.modified?.value ?? null,
      distributionCount: distributionsMap.size,
      keywords: [...keywords],
      distributions: [...distributionsMap.values()],
    }
  }

  async function fetchDatasetProvenance(uri: string): Promise<DatasetProvenance | null> {
    const query = `
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?obs ?obsTitle ?startTime ?endTime
             ?sensor ?sensorTitle ?sensorDesc
             ?foi ?foiTitle ?foiDesc
             ?prop ?propTitle ?propDesc
      WHERE {
        BIND(<${uri}> AS ?dataset)
        ?dataset prov:wasGeneratedBy ?obs .
        ?obs a sosa:Observation .
        OPTIONAL { ?obs dcterms:title ?obsTitle }
        OPTIONAL { ?obs prov:startedAtTime ?startTime }
        OPTIONAL { ?obs prov:endedAtTime ?endTime }
        OPTIONAL {
          ?obs sosa:madeBySensor ?sensor .
          OPTIONAL { ?sensor dcterms:title ?sensorTitle }
          OPTIONAL { ?sensor dcterms:description ?sensorDesc }
        }
        OPTIONAL {
          ?obs sosa:hasFeatureOfInterest ?foi .
          OPTIONAL { ?foi dcterms:title ?foiTitle }
          OPTIONAL { ?foi dcterms:description ?foiDesc }
        }
        OPTIONAL {
          ?obs sosa:observedProperty ?prop .
          OPTIONAL { ?prop dcterms:title ?propTitle }
          OPTIONAL { ?prop dcterms:description ?propDesc }
        }
      }
      LIMIT 1
    `

    const results = await querySparql(graphStore.endpoint, query)
    if (results.results.bindings.length === 0) return null

    const b = results.results.bindings[0]
    return {
      observationUri: b.obs.value,
      observationTitle: b.obsTitle?.value ?? null,
      startTime: b.startTime?.value ?? null,
      endTime: b.endTime?.value ?? null,
      sensor: b.sensor
        ? {
            uri: b.sensor.value,
            title: b.sensorTitle?.value ?? null,
            description: b.sensorDesc?.value ?? null,
          }
        : null,
      featureOfInterest: b.foi
        ? {
            uri: b.foi.value,
            title: b.foiTitle?.value ?? null,
            description: b.foiDesc?.value ?? null,
          }
        : null,
      observedProperty: b.prop
        ? {
            uri: b.prop.value,
            title: b.propTitle?.value ?? null,
            description: b.propDesc?.value ?? null,
          }
        : null,
    }
  }

  async function fetchDatasetWorkflowContext(uri: string): Promise<WorkflowContext | null> {
    // Step 1: find the resource the dataset is isPartOf (a step or the workflow directly)
    const contextQuery = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX wild:    <http://purl.org/wild/vocab#>

      SELECT ?context ?title ?description ?isWorkflow WHERE {
        BIND(<${uri}> AS ?dataset)
        ?dataset dcterms:isPartOf ?context .
        OPTIONAL { ?context dcterms:title ?title }
        OPTIONAL { ?context dcterms:description ?description }
        OPTIONAL {
          ?context a wild:WorkflowModel .
          BIND(true AS ?isWorkflow)
        }
      }
      LIMIT 1
    `
    const contextResults = await querySparql(graphStore.endpoint, contextQuery)
    if (contextResults.results.bindings.length === 0) return null

    const cb = contextResults.results.bindings[0]
    const contextUri = cb.context.value
    const isWorkflow = cb.isWorkflow?.value === 'true'

    if (isWorkflow) {
      return {
        stepUri: null,
        stepTitle: null,
        stepDescription: null,
        isDirectWorkflowLink: true,
        workflowUri: contextUri,
        workflowTitle: cb.title?.value ?? null,
      }
    }

    // Step 2: find which workflow model contains this step via list traversal
    const workflowQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?workflow ?workflowTitle WHERE {
        ?workflow a wild:WorkflowModel ;
                 wild:hasBehaviour ?root .
        ?root wild:hasChildActivities/rdf:rest*/rdf:first <${contextUri}> .
        OPTIONAL { ?workflow dcterms:title ?workflowTitle }
      }
      LIMIT 1
    `
    const workflowResults = await querySparql(graphStore.endpoint, workflowQuery)
    const wb = workflowResults.results.bindings[0]

    return {
      stepUri: contextUri,
      stepTitle: cb.title?.value ?? null,
      stepDescription: cb.description?.value ?? null,
      isDirectWorkflowLink: false,
      workflowUri: wb?.workflow?.value ?? null,
      workflowTitle: wb?.workflowTitle?.value ?? null,
    }
  }

  return {
    datasets,
    loading,
    error,
    fetchDatasets,
    fetchDataset,
    fetchDatasetProvenance,
    fetchDatasetWorkflowContext,
  }
})

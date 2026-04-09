import { defineStore } from 'pinia'
import { ref } from 'vue'
import { querySparql, updateSparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

export interface AddDatasetForm {
  title: string
  description: string
  keywords: string
  downloadUrl: string
  mediaType: string
  byteSize: string
  stepUri: string
  workflowInstanceUri: string
  isFullWorkflowLink: boolean
}

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
  // Set when stepUri is a leaf activity nested inside a composite (e.g. parallel) step
  parentStepUri: string | null
  parentStepTitle: string | null
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
    // Step 1: find the resource the dataset is isPartOf (leaf activity, step, or workflow)
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
        parentStepUri: null,
        parentStepTitle: null,
        isDirectWorkflowLink: true,
        workflowUri: contextUri,
        workflowTitle: cb.title?.value ?? null,
      }
    }

    // Step 2: find parent step (if context is a leaf within a composite) and parent workflow.
    // The context is either a direct child of the root (top-level step) or a grandchild
    // (leaf activity inside a composite/parallel step).
    const parentQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?parentStep ?parentStepTitle ?workflow ?workflowTitle WHERE {
        OPTIONAL {
          ?parentStep wild:hasChildActivities/rdf:rest*/rdf:first <${contextUri}> .
          OPTIONAL { ?parentStep dcterms:title ?parentStepTitle }
        }
        OPTIONAL {
          ?workflow a wild:WorkflowModel ;
                   wild:hasBehaviour ?root .
          {
            ?root wild:hasChildActivities/rdf:rest*/rdf:first <${contextUri}> .
          }
          UNION
          {
            ?root wild:hasChildActivities/rdf:rest*/rdf:first ?anyStep .
            ?anyStep wild:hasChildActivities/rdf:rest*/rdf:first <${contextUri}> .
          }
          OPTIONAL { ?workflow dcterms:title ?workflowTitle }
        }
      }
      LIMIT 1
    `
    const parentResults = await querySparql(graphStore.endpoint, parentQuery)
    const pb = parentResults.results.bindings[0]

    return {
      stepUri: contextUri,
      stepTitle: cb.title?.value ?? null,
      stepDescription: cb.description?.value ?? null,
      parentStepUri: pb?.parentStep?.value ?? null,
      parentStepTitle: pb?.parentStepTitle?.value ?? null,
      isDirectWorkflowLink: false,
      workflowUri: pb?.workflow?.value ?? null,
      workflowTitle: pb?.workflowTitle?.value ?? null,
    }
  }

  async function addDataset(form: AddDatasetForm): Promise<string> {
    const suffix = Date.now().toString(36)
    const slug = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'dataset'

    const base = 'https://example.org/vpd#'
    const datasetUri = `${base}dataset-${slug}-${suffix}`
    const distUri = `${base}dist-${slug}-${suffix}`
    const obsUri = `${base}obs-${slug}-${suffix}`
    const catalogUri = `${base}catalog`
    const now = new Date().toISOString()
    const today = now.slice(0, 10)

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    const keywords = form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)

    // Dataset triples
    const datasetTriples: string[] = [
      `<${datasetUri}> a dcat:Dataset`,
      `  dcterms:title "${esc(form.title)}"@en`,
    ]
    if (form.description) datasetTriples.push(`  dcterms:description "${esc(form.description)}"@en`)
    for (const kw of keywords) datasetTriples.push(`  dcat:keyword "${esc(kw)}"`)
    datasetTriples.push(`  dcterms:modified "${today}"^^xsd:date`)
    datasetTriples.push(`  dcat:distribution <${distUri}>`)
    datasetTriples.push(`  prov:wasGeneratedBy <${obsUri}>`)
    if (form.stepUri) datasetTriples.push(`  dcterms:isPartOf <${form.stepUri}>`)

    // Distribution triples
    const distTriples: string[] = [
      `<${distUri}> a dcat:Distribution`,
      `  dcat:downloadURL <${form.downloadUrl}>`,
    ]
    if (form.mediaType) {
      distTriples.push(
        `  dcat:mediaType <https://www.iana.org/assignments/media-types/${form.mediaType}>`,
      )
    }
    if (form.byteSize) {
      distTriples.push(
        `  dcat:byteSize "${parseInt(form.byteSize, 10)}"^^xsd:nonNegativeInteger`,
      )
    }

    // Observation triples
    const obsTriples: string[] = [
      `<${obsUri}> a sosa:Observation , prov:Activity , wild:ActivityInstance`,
      `  sosa:hasResult <${datasetUri}>`,
      `  prov:startedAtTime "${now}"^^xsd:dateTime`,
      `  prov:endedAtTime "${now}"^^xsd:dateTime`,
      `  wild:hasState wild:done`,
    ]
    // Only link to a specific activity if the step is a real activity (not the workflow model)
    if (form.stepUri && !form.isFullWorkflowLink) {
      obsTriples.push(`  wild:activityInstanceOf <${form.stepUri}>`)
    }
    if (form.workflowInstanceUri) {
      obsTriples.push(`  wild:inWorkflowInstance <${form.workflowInstanceUri}>`)
    }

    const blocks = [
      datasetTriples.join(' ;\n') + ' .',
      distTriples.join(' ;\n') + ' .',
      obsTriples.join(' ;\n') + ' .',
      `<${catalogUri}> dcat:dataset <${datasetUri}> .`,
    ]

    const update = `
PREFIX dcat:    <http://www.w3.org/ns/dcat#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>
PREFIX prov:    <http://www.w3.org/ns/prov#>
PREFIX sosa:    <http://www.w3.org/ns/sosa/>
PREFIX wild:    <http://purl.org/wild/vocab#>

INSERT DATA {
${blocks.join('\n\n')}
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
    fetchDatasetProvenance,
    fetchDatasetWorkflowContext,
    addDataset,
  }
})

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
  // True when dcterms:isPartOf points directly to a wild:WorkflowInstance (cross-cutting)
  isDirectWorkflowLink: boolean
  // The activity instance (sosa:Observation / wild:ActivityInstance) the dataset is isPartOf
  activityInstanceUri: string | null
  activityInstanceTitle: string | null
  // The model activity this instance is activityInstanceOf
  modelActivityUri: string | null
  modelActivityTitle: string | null
  modelActivityDescription: string | null
  // Parent step in the model (set when model activity is a leaf, e.g. under ParallelActivity)
  parentStepUri: string | null
  parentStepTitle: string | null
  // The workflow instance (run)
  runUri: string | null
  runTitle: string | null
  // The workflow model
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
    // Step 1: find the dcterms:isPartOf target — either a wild:WorkflowInstance (cross-cutting)
    // or a wild:ActivityInstance (step-level observation).
    const contextQuery = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX wild:    <http://purl.org/wild/vocab#>

      SELECT ?context ?contextTitle ?isWorkflowInstance WHERE {
        BIND(<${uri}> AS ?dataset)
        ?dataset dcterms:isPartOf ?context .
        OPTIONAL { ?context dcterms:title ?contextTitle }
        OPTIONAL {
          ?context a wild:WorkflowInstance .
          BIND(true AS ?isWorkflowInstance)
        }
      }
      LIMIT 1
    `
    const contextResults = await querySparql(graphStore.endpoint, contextQuery)
    if (contextResults.results.bindings.length === 0) return null

    const cb = contextResults.results.bindings[0]
    const contextUri = cb.context.value
    const isWorkflowInstance = cb.isWorkflowInstance?.value === 'true'

    if (isWorkflowInstance) {
      // Cross-cutting: resolve the workflow model for navigation
      const modelQuery = `
        PREFIX wild:    <http://purl.org/wild/vocab#>
        PREFIX dcterms: <http://purl.org/dc/terms/>

        SELECT ?model ?modelTitle WHERE {
          <${contextUri}> wild:workflowInstanceOf ?model .
          OPTIONAL { ?model dcterms:title ?modelTitle }
        }
        LIMIT 1
      `
      const modelResults = await querySparql(graphStore.endpoint, modelQuery)
      const mb = modelResults.results.bindings[0]
      return {
        isDirectWorkflowLink: true,
        activityInstanceUri: null,
        activityInstanceTitle: null,
        modelActivityUri: null,
        modelActivityTitle: null,
        modelActivityDescription: null,
        parentStepUri: null,
        parentStepTitle: null,
        runUri: contextUri,
        runTitle: cb.contextTitle?.value ?? null,
        workflowUri: mb?.model?.value ?? null,
        workflowTitle: mb?.modelTitle?.value ?? null,
      }
    }

    // Step-level: context is an ActivityInstance.
    // Resolve: activityInstanceOf → model activity (+ parent step if leaf),
    //          inWorkflowInstance → workflow instance → workflow model.
    const detailQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?modelActivity ?modelActivityTitle ?modelActivityDesc
             ?parentStep ?parentStepTitle
             ?workflowInstance ?workflowInstanceTitle
             ?workflowModel ?workflowModelTitle
      WHERE {
        OPTIONAL {
          <${contextUri}> wild:activityInstanceOf ?modelActivity .
          OPTIONAL { ?modelActivity dcterms:title ?modelActivityTitle }
          OPTIONAL { ?modelActivity dcterms:description ?modelActivityDesc }
          OPTIONAL {
            ?parentStep wild:hasChildActivities/rdf:rest*/rdf:first ?modelActivity .
            OPTIONAL { ?parentStep dcterms:title ?parentStepTitle }
          }
        }
        OPTIONAL {
          <${contextUri}> wild:inWorkflowInstance ?workflowInstance .
          OPTIONAL { ?workflowInstance dcterms:title ?workflowInstanceTitle }
          OPTIONAL {
            ?workflowInstance wild:workflowInstanceOf ?workflowModel .
            OPTIONAL { ?workflowModel dcterms:title ?workflowModelTitle }
          }
        }
      }
      LIMIT 1
    `
    const detailResults = await querySparql(graphStore.endpoint, detailQuery)
    const db = detailResults.results.bindings[0]

    return {
      isDirectWorkflowLink: false,
      activityInstanceUri: contextUri,
      activityInstanceTitle: cb.contextTitle?.value ?? null,
      modelActivityUri: db?.modelActivity?.value ?? null,
      modelActivityTitle: db?.modelActivityTitle?.value ?? null,
      modelActivityDescription: db?.modelActivityDesc?.value ?? null,
      parentStepUri: db?.parentStep?.value ?? null,
      parentStepTitle: db?.parentStepTitle?.value ?? null,
      runUri: db?.workflowInstance?.value ?? null,
      runTitle: db?.workflowInstanceTitle?.value ?? null,
      workflowUri: db?.workflowModel?.value ?? null,
      workflowTitle: db?.workflowModelTitle?.value ?? null,
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
    // isPartOf → the new observation (= activity instance) for step-level datasets,
    // or the workflow instance for cross-cutting datasets.
    if (form.isFullWorkflowLink && form.workflowInstanceUri) {
      datasetTriples.push(`  dcterms:isPartOf <${form.workflowInstanceUri}>`)
    } else if (!form.isFullWorkflowLink && form.stepUri) {
      datasetTriples.push(`  dcterms:isPartOf <${obsUri}>`)
    }

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

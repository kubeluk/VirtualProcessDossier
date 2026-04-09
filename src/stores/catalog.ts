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

  return { datasets, loading, error, fetchDatasets, fetchDataset }
})

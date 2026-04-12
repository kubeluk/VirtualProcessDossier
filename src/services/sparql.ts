import axios from 'axios'

export interface SparqlBinding {
  [key: string]: {
    type: 'uri' | 'literal' | 'bnode'
    value: string
    datatype?: string
    'xml:lang'?: string
  }
}

export interface SparqlResults {
  head: { vars: string[] }
  results: { bindings: SparqlBinding[] }
}

export async function querySparql(endpoint: string, query: string): Promise<SparqlResults> {
  const response = await axios.get<SparqlResults>(endpoint, {
    params: { query },
    headers: { Accept: 'application/sparql-results+json' },
  })
  return response.data
}

export async function askSparql(endpoint: string, query: string): Promise<boolean> {
  const response = await axios.get<{ boolean: boolean }>(endpoint, {
    params: { query },
    headers: { Accept: 'application/sparql-results+json' },
  })
  return response.data.boolean === true
}

export async function updateSparql(endpoint: string, update: string): Promise<void> {
  await axios.post(
    endpoint,
    new URLSearchParams({ update }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
}

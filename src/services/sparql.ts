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
  // Batched queries can exceed reverse-proxy URL limits when encoded in a GET.
  const response = await axios.post<SparqlResults>(endpoint, query, {
    headers: {
      'Content-Type': 'application/sparql-query',
      Accept: 'application/sparql-results+json',
    },
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
  await axios.post(endpoint, new URLSearchParams({ update }), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}

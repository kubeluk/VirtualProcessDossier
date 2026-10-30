import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { DataFactory, Parser, Store } from 'n3'
import ts from 'typescript'
import { createPinia, setActivePinia } from 'pinia'
import { select } from 'shacl-engine/lib/sparql.js'

const fixture = new URL('../data/material-example.ttl', import.meta.url)
const exampleFixture = existsSync(fixture)
  ? fixture
  : new URL('../data/material-v2-example.ttl', import.meta.url)

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const modules = new Map([
  [
    '@/stores/graph',
    moduleUrl(
      `export const useGraphStore = () => ({ endpoint: '/sparql', updateEndpoint: '/update' })`,
    ),
  ],
  [
    '@/services/sparql',
    moduleUrl(
      `export const querySparql = (...args) => globalThis.materialUIQuery(...args); export const askSparql = async () => false; export const updateSparql = async () => {};`,
    ),
  ],
  [
    '@/stores/workflow',
    moduleUrl(`export const QUDT_UNIT_LABELS = { 'http://qudt.org/vocab/unit/MilliM': 'mm' };`),
  ],
])
function loadModule(path) {
  if (modules.has(path)) return modules.get(path)
  const source = readFileSync(
    new URL('../src/' + path.replace('@/', '') + '.ts', import.meta.url),
    'utf8',
  )
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(
      /from ['"]([^'"]+)['"]/g,
      (_, specifier) =>
        `from ${JSON.stringify(specifier.startsWith('@/') ? loadModule(specifier) : import.meta.resolve(specifier))}`,
    )
  const url = moduleUrl(compiled)
  modules.set(path, url)
  return url
}
const { useMaterialStore } = await import(loadModule('@/stores/material'))
const { useDossierStore } = await import(loadModule('@/stores/dossier'))
const { useLaminateStore } = await import(loadModule('@/stores/laminate'))
const { orderedStack, materialResourceId } = await import(loadModule('@/services/material'))
const n = DataFactory.namedNode
const laminateUri = 'http://purl.org/for/data/laminate/1#it'
const partUri = 'http://purl.org/for/part#test'
const example = readFileSync(exampleFixture, 'utf8')
let data
function reset() {
  setActivePinia(createPinia())
  const turtle =
    example.slice(0, example.indexOf('# Schema')) +
    example.slice(example.indexOf('# Instances (ABox)'))
  data = new Store(
    new Parser().parse(
      turtle +
        `@prefix sosa: <http://www.w3.org/ns/sosa/> .
\n<${partUri}> a sosa:Sample ; sosa:isResultOf <http://purl.org/for/run#test> ; prov:wasDerivedFrom <${laminateUri}> .`,
    ),
  )
  // Example classes alone must suffice; no superclass inference or legacy geo:Feature types.
  // Rename tapes so URI sorting gives a different result from the RDF stack order.
  const ids = ['20', '3', '15', '7', '100', '2']
  const rename = (term) => {
    const match = term.value.match(/^http:\/\/purl.org\/for\/data\/tape\/([1-6])#it$/)
    return match ? n(`http://purl.org/for/data/tape/${ids[Number(match[1]) - 1]}#it`) : term
  }
  data = new Store(
    [...data].map((q) => DataFactory.quad(rename(q.subject), q.predicate, rename(q.object))),
  )
}
globalThis.materialUIQuery = async (_endpoint, query) => {
  if (process.env.VPD_FUSEKI_ENDPOINT) {
    const useGet = process.env.VPD_FUSEKI_GET === '1'
    const endpoint = useGet
      ? `${process.env.VPD_FUSEKI_ENDPOINT}?${new URLSearchParams({ query })}`
      : process.env.VPD_FUSEKI_ENDPOINT
    const response = await fetch(endpoint, {
      method: useGet ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json',
      },
      body: useGet ? undefined : query,
    })
    if (!response.ok)
      throw new Error(`Fuseki query failed: HTTP ${response.status} ${await response.text()}`)
    return response.json()
  }
  const rows = await select({ bindings: [], dataset: data, factory: DataFactory, query })
  return {
    head: { vars: [] },
    results: {
      bindings: rows.map((row) =>
        Object.fromEntries(
          [...row].map(([key, value]) => [
            key.value,
            {
              type:
                value.termType === 'NamedNode'
                  ? 'uri'
                  : value.termType === 'BlankNode'
                    ? 'bnode'
                    : 'literal',
              value: value.value,
            },
          ]),
        ),
      ),
    },
  }
}
const expectedAngles = [0, 60, 120, 120, 60, 0]

test('Parts detail and batch views read the updated classes, stack order, tape IDs, and reference points', async () => {
  reset()
  const store = useMaterialStore()
  const summaries = await store.fetchParts()
  assert.equal(summaries.length, 1)
  for (const detail of [
    await store.fetchPartDetail(summaries[0]),
    ...(await store.fetchAllParts()),
  ]) {
    assert.deepEqual(
      detail.plies.map((p) => p.orientation),
      expectedAngles,
    )
    assert.deepEqual(
      detail.plies.map((p) => p.tapeId),
      ['20', '3', '15', '7', '100', '2'],
    )
    assert.equal(detail.properties.length, 3)
    assert.equal(detail.needlePoints.length, 8)
    assert.equal(detail.needlePoints[0].pointId, '1')
    assert.equal(detail.needlePoints[0].referenceUri, 'http://purl.org/for/data/laminate/1#origin')
  }
})

test('Dossier detail and gallery retain stack order without legacy material classes', async () => {
  reset()
  const store = useDossierStore()
  const detail = await store.fetchDossier(partUri)
  assert.equal(detail.length, 400)
  assert.deepEqual(
    detail.plies.map((p) => p.orientation),
    expectedAngles,
  )
  const cards = await store.fetchAllPartSummaries()
  assert.equal(cards.length, 1)
  assert.equal(cards[0].thickness, 1.56)
  assert.deepEqual(
    cards[0].plies.map((p) => p.orientation),
    expectedAngles,
  )
})

test('Laminate editor loads missing identifiers and dimensions as empty values for correction', async () => {
  reset()
  data.removeQuads(
    data.getQuads(n(laminateUri), n('http://purl.org/dc/terms/identifier'), null, null),
  )
  const sizes = data.getObjects(
    n(laminateUri),
    n('http://www.opengis.net/ont/geosparql#hasSize'),
    null,
  )
  const thickness = sizes.find((size) =>
    data.countQuads(
      size,
      n('http://qudt.org/schema/qudt/hasQuantityKind'),
      n('http://qudt.org/vocab/quantitykind/Thickness'),
      null,
    ),
  )
  data.removeQuads(
    data.getQuads(
      n(laminateUri),
      n('http://www.opengis.net/ont/geosparql#hasSize'),
      thickness,
      null,
    ),
  )
  const form = await useLaminateStore().fetchLaminate(laminateUri)
  assert.equal(form.identifier, '')
  assert.equal(form.thickness, null)
  assert.deepEqual(
    form.plies.map((p) => p.orientation),
    expectedAngles,
  )
})

test('list ordering rejects cycles and missing tails; resource labels support v2 URIs', () => {
  const term = (value) => ({ type: 'uri', value })
  assert.throws(() => orderedStack([{ cell: term('a'), next: term('a') }]))
  assert.throws(() => orderedStack([{ cell: term('a'), next: term('b') }]))
  assert.equal(materialResourceId('http://purl.org/for/data/tape/1086#it'), '1086')
  assert.equal(
    materialResourceId('http://purl.org/for/data/laminate/169#needle-point-1128'),
    '1128',
  )
})

test(
  'batch views and editor read the complete migrated material graph',
  { skip: process.env.VPD_FULL_GRAPH_TEST !== '1' },
  async () => {
    reset()
    data = new Store(
      new Parser().parse(readFileSync(new URL('../data/material-v2.ttl', import.meta.url), 'utf8')),
    )
    const parts = await useMaterialStore().fetchAllParts()
    assert.equal(parts.length, 141)
    assert.equal(
      parts.reduce((sum, p) => sum + p.plies.length, 0),
      1086,
    )
    assert.equal(
      parts.reduce((sum, p) => sum + p.needlePoints.length, 0),
      1128,
    )
    const cards = await useDossierStore().fetchAllPartSummaries()
    assert.equal(cards.length, 141)
    assert.equal(
      cards.reduce((sum, c) => sum + c.plies.length, 0),
      1086,
    )
    const laminates = await useLaminateStore().fetchLaminates()
    assert.equal(laminates.length, 141)
    const forms = await useLaminateStore().fetchLaminateBatch(laminates.map((l) => l.uri))
    assert.equal(Object.keys(forms).length, 141)
    assert.equal(
      Object.values(forms).reduce((sum, form) => sum + form.plies.length, 0),
      1086,
    )
    const incomplete = await useLaminateStore().fetchLaminate(
      'http://purl.org/for/data/laminate/6#it',
    )
    assert.equal(incomplete.identifier, '')
    assert.equal(incomplete.thickness, null)
  },
)

test('multiple run annotations produce one card per part', async () => {
  reset()
  const run = n('http://purl.org/for/run#test')
  const comment = n('http://www.w3.org/2000/01/rdf-schema#comment')
  data.addQuad(run, comment, DataFactory.literal('First annotation'))
  data.addQuad(run, comment, DataFactory.literal('Second annotation'))
  assert.equal((await useMaterialStore().fetchParts()).length, 1)
  assert.equal((await useMaterialStore().fetchAllParts()).length, 1)
})

test('laminate batch uses four queries and keeps laminates separate', async () => {
  reset()
  const rename = (term) =>
    term.termType === 'NamedNode' && term.value.startsWith('http://purl.org/for/data/')
      ? n(term.value.replace('/data/', '/data/second/'))
      : term
  data.addQuads(
    [...data].map((q) => DataFactory.quad(rename(q.subject), q.predicate, rename(q.object))),
  )
  const store = useLaminateStore()
  const laminates = await store.fetchLaminates()
  const originalQuery = globalThis.materialUIQuery
  const queries = []
  globalThis.materialUIQuery = async (...args) => {
    queries.push(args[1])
    return originalQuery(...args)
  }
  try {
    const forms = await store.fetchLaminateBatch(laminates.map((l) => l.uri))
    assert.equal(queries.length, 4)
    assert.equal(Object.keys(forms).length, laminates.length)
    assert.equal(
      Object.values(forms).reduce((sum, form) => sum + form.plies.length, 0),
      process.env.VPD_FUSEKI_ENDPOINT ? 1086 : 12,
    )
  } finally {
    globalThis.materialUIQuery = originalQuery
  }
})

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { DataFactory, Parser, Store } from 'n3'
import { Validator } from 'shacl-engine'
import { validations } from 'shacl-engine/sparql.js'
import sparqljs from 'sparqljs'

const fixture = new URL('../data/material-example.ttl', import.meta.url)
const exampleFixture = existsSync(fixture)
  ? fixture
  : new URL('../data/material-v2-example.ttl', import.meta.url)

const source = readFileSync(new URL('../src/services/laminate.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
}).outputText
const { laminateTriples, laminateDelete, validateLaminate, LAMINATE_PREFIXES } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)
const uri = 'http://purl.org/for/data/laminate/test#it'
const form = () => ({
  label: 'BASF "PA6"\nGF60',
  identifier: '1_1',
  length: 400,
  width: 400,
  thickness: 1.56,
  layupLabel: '[0/60/120]s',
  plies: [0, 60, 120, 120, 60, 0].map((orientation) => ({
    polymer: 'PA6',
    fiberType: 'GF',
    massFraction: 60,
    orientation,
  })),
  points: [{ x: 190, y: -100, referenceLabel: 'Centre' }],
})
const shapes = new Store(new Parser().parse(readFileSync(exampleFixture, 'utf8')))
const validator = new Validator(shapes, { factory: DataFactory, validations })
const turtlePrefixes = LAMINATE_PREFIXES.replace(/PREFIX ([^\n]+)/g, '@prefix $1 .')
const parse = (input) => new Store(new Parser().parse(turtlePrefixes + input))

for (const count of [0, 1, 12]) {
  test(`generated RDF conforms to the example SHACL shapes with ${count} points`, async () => {
    const f = form()
    f.points = Array.from({ length: count }, (_, i) => ({ x: i, y: -i, referenceLabel: 'Centre' }))
    const data = parse(laminateTriples(uri, f, 'test'))
    const report = await validator.validate({ dataset: data })
    assert.equal(report.conforms, true, JSON.stringify(report.results))
  })
}

test('stack uses distinct tapes, preserving repeated angles in order', () => {
  const data = parse(laminateTriples(uri, form(), 'test'))
  const n = DataFactory.namedNode
  const param = (local) => n(`http://purl.org/for/parameter#${local}`)
  const prov = (local) => n(`http://www.w3.org/ns/prov#${local}`)
  const rdf = (local) => n(`http://www.w3.org/1999/02/22-rdf-syntax-ns#${local}`)
  const layup = data.getObjects(n(uri), prov('wasDerivedFrom'), null)[0]
  let cell = data.getObjects(layup, param('tapeStack'), null)[0]
  const tapes = [],
    angles = []
  while (!cell.equals(rdf('nil'))) {
    const tape = data.getObjects(cell, rdf('first'), null)[0]
    tapes.push(tape.value)
    const derivation = data.getSubjects(prov('entity'), tape, null)[0]
    const quantity = data.getObjects(derivation, param('fiberOrientation'), null)[0]
    angles.push(
      Number(data.getObjects(quantity, n('http://qudt.org/schema/qudt/value'), null)[0].value),
    )
    cell = data.getObjects(cell, rdf('rest'), null)[0]
  }
  assert.equal(new Set(tapes).size, 6)
  assert.deepEqual(angles, [0, 60, 120, 120, 60, 0])
})

test('updates and deletion parse as SPARQL, including retained reference points', () => {
  const parser = new sparqljs.Parser()
  const triples = laminateTriples(uri, form(), 'revision')
  for (const statement of [
    `INSERT DATA { ${triples} }`,
    laminateDelete(uri),
    `${laminateDelete(uri, ['http://example.org/origin'])}; INSERT DATA { ${triples} }`,
  ]) {
    assert.equal(parser.parse(LAMINATE_PREFIXES + statement).type, 'update')
  }
})

test('validation rejects missing fields, invalid numbers, and excessive needle points', () => {
  for (const change of [
    (f) => {
      f.label = ''
    },
    (f) => {
      f.identifier = ''
    },
    (f) => {
      f.length = 0
    },
    (f) => {
      f.width = -1
    },
    (f) => {
      f.thickness = NaN
    },
    (f) => {
      f.plies = []
    },
    (f) => {
      f.plies[0].polymer = ''
    },
    (f) => {
      f.plies[0].massFraction = 101
    },
    (f) => {
      f.plies[0].orientation = Infinity
    },
    (f) => {
      f.points[0].x = ''
    },
    (f) => {
      f.points = Array(13).fill(f.points[0])
    },
  ]) {
    const f = form()
    change(f)
    assert.throws(() => validateLaminate(f))
  }
  assert.throws(() => laminateTriples('http://example.org/> } malicious', form(), 'test'))
})

// Evaluate the actual DELETE WHERE selection locally; Fuseki uses the same SPARQL semantics.
async function applyDelete(data, retained = []) {
  const { select } = await import('shacl-engine/lib/sparql.js')
  const statement = laminateDelete(uri, retained)
  const where = statement.slice(statement.indexOf('WHERE'))
  const rows = await select({
    bindings: [],
    dataset: data,
    factory: DataFactory,
    query: LAMINATE_PREFIXES + 'SELECT ?node ?predicate ?object ' + where,
  })
  // Comunica scopes source blank nodes in SELECT results; map them back to the local dataset.
  const blankNodes = new Map(
    [...data]
      .flatMap((q) => [q.subject, q.object])
      .filter((t) => t.termType === 'BlankNode')
      .map((t) => [t.value, t]),
  )
  const local = (term) =>
    term.termType === 'BlankNode'
      ? (blankNodes.get(term.value.replace(/^bc_[0-9]+_/, '')) ?? term)
      : term
  for (const row of rows) {
    data.delete(
      DataFactory.quad(local(row.get('node')), row.get('predicate'), local(row.get('object'))),
    )
  }
}

test('deletion removes owned quantities, lists, tapes, and needle points completely', async () => {
  const f = form()
  f.plies = f.plies.slice(0, 1)
  const data = parse(laminateTriples(uri, f, 'test'))
  await applyDelete(data)
  assert.equal(data.size, 0)
})

test('deletion preserves shared layups and all their descendants', async () => {
  const f = form()
  f.plies = f.plies.slice(0, 1)
  f.points = []
  const data = parse(laminateTriples(uri, f, 'test'))
  const shared = parse(
    '<http://example.org/other> prov:wasDerivedFrom <http://purl.org/for/data/laminate/test#layup> .',
  )
  data.addQuads([...shared])
  await applyDelete(data)
  assert.equal(data.countQuads(DataFactory.namedNode(uri), null, null, null), 0)
  assert.ok(
    data.countQuads(
      DataFactory.namedNode('http://purl.org/for/data/laminate/test#layup'),
      null,
      null,
      null,
    ) > 0,
  )
  assert.ok(
    data.countQuads(
      DataFactory.namedNode('http://purl.org/for/data/tape/test-1#it'),
      null,
      null,
      null,
    ) > 0,
  )
  const report = await validator.validate({ dataset: data })
  assert.equal(report.conforms, true)
})

test('an update retains existing reference point metadata', async () => {
  const f = form()
  f.plies = f.plies.slice(0, 1)
  const data = parse(laminateTriples(uri, f, 'test'))
  const origin = 'http://purl.org/for/data/laminate/test#origin'
  await applyDelete(data, [origin])
  assert.equal(data.size, 2)
  assert.equal(data.countQuads(DataFactory.namedNode(origin), null, null, null), 2)
})

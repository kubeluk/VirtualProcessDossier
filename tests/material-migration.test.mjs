import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DataFactory, Parser, Store } from 'n3'
import { migrateMaterial } from '../data/transformations/migrate_material_v2.mjs'

const source = new Store(
  new Parser().parse(readFileSync(new URL('../data/material.ttl', import.meta.url), 'utf8')),
)
const { output, counts, renames } = migrateMaterial(source)
const n = DataFactory.namedNode
const base = 'http://purl.org/for/'
const prov = (name) => n('http://www.w3.org/ns/prov#' + name)
const param = (name) => n(base + 'parameter#' + name)
const rdf = (name) => n('http://www.w3.org/1999/02/22-rdf-syntax-ns#' + name)
const object = (store, s, p) => {
  const values = store.getObjects(s, p, null)
  assert.equal(values.length, 1)
  return values[0]
}
function list(store, head) {
  const values = [],
    seen = new Set()
  while (!head.equals(rdf('nil'))) {
    assert(!seen.has(head.value), 'Cyclic list')
    seen.add(head.value)
    values.push(object(store, head, rdf('first')))
    head = object(store, head, rdf('rest'))
  }
  return values
}

test('migration covers all source resources without modifying the source graph', () => {
  assert.deepEqual(counts, {
    laminates: 141,
    layups: 141,
    tapes: 1086,
    needlePoints: 1128,
    referencePoints: 141,
  })
  assert.equal(source.size, 43488)
  assert(
    source.has(
      DataFactory.quad(
        n(base + 'laminat#1'),
        rdf('type'),
        n('http://www.opengis.net/ont/geosparql#Feature'),
      ),
    ),
  )
})

test('all tape stacks preserve order and direct/qualified provenance', () => {
  const stacks = source.getQuads(null, prov('value'), null, null)
  assert.equal(stacks.length, counts.layups)
  for (const q of stacks) {
    const layup = renames.get(q.subject.value)
    const expected = list(source, q.object).map((t) => renames.get(t.value).value)
    const actual = list(output, object(output, layup, param('tapeStack'))).map((t) => t.value)
    assert.deepEqual(actual, expected)
    assert.deepEqual(
      output
        .getObjects(layup, prov('wasDerivedFrom'), null)
        .map((t) => t.value)
        .sort(),
      [...expected].sort(),
    )
    const qualified = output
      .getObjects(layup, prov('qualifiedDerivation'), null)
      .map((d) => object(output, d, prov('entity')).value)
    assert.deepEqual(qualified.sort(), [...expected].sort())
  }
})

test('all needle point coordinates and reference metadata are retained', () => {
  const qv = n('http://qudt.org/schema/qudt/quantityValue')
  const value = n('http://qudt.org/schema/qudt/value')
  for (const q of source.getQuads(null, n(base + 'param#hasNeedlePoint'), null, null)) {
    const point = renames.get(q.object.value)
    const coordinates = (store) =>
      list(store, object(store, object(store, store === source ? q.object : point, qv), value)).map(
        (t) => t.id,
      )
    assert.deepEqual(coordinates(output), coordinates(source))
    const origin = object(output, point, param('referencePoint'))
    assert(origin.value.startsWith(renames.get(q.subject.value).value.replace(/it$/, 'origin')))
    assert(
      output.countQuads(origin, n('http://www.w3.org/2000/01/rdf-schema#comment'), null, null) > 0,
    )
  }
})

test('part, run, and extraction identities remain intact with renamed material references', () => {
  const part = n(base + 'part#1'),
    run = n(base + 'run#1'),
    laminate = renames.get(base + 'laminat#1')
  assert(output.has(DataFactory.quad(part, prov('wasDerivedFrom'), laminate)))
  assert(output.has(DataFactory.quad(part, n('http://www.w3.org/ns/sosa/isResultOf'), run)))
  assert(output.has(DataFactory.quad(n(base + 'extract#1'), prov('generated'), laminate)))
})

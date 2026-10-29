#!/usr/bin/env node
// Run from any directory: node data/transformations/migrate_material_v2.mjs
// Offline migration: reads material.ttl and the current example; never updates a triple store.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { DataFactory, Parser, Store, Writer } from 'n3'
import { Validator } from 'shacl-engine'
import { validations } from 'shacl-engine/sparql.js'

const { namedNode: n, quad } = DataFactory
const BASE = 'http://purl.org/for/'
const FOR = BASE + 'terms#'
const OLD_PARAM = BASE + 'param#'
const PARAM = BASE + 'parameter#'
const POS = BASE + 'position#'
const PROV = 'http://www.w3.org/ns/prov#'
const QUDT = 'http://qudt.org/schema/qudt/'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const KIND = 'http://qudt.org/vocab/quantitykind/'
const TYPE = n(RDF + 'type')
const ORIGIN = n(POS + 'laminatReferencePoint')
const dataUrl = (name) => new URL('../' + name, import.meta.url)

function only(terms, context) {
  assert.equal(terms.length, 1, `Expected exactly one ${context}, found ${terms.length}`)
  return terms[0]
}

export function migrateMaterial(source) {
  const output = new Store()
  const renames = new Map()
  const pointOrigins = new Map()
  const origins = new Map()
  const subjects = [...new Map([...source].map((q) => [q.subject.id, q.subject])).values()]
  const instances = (prefix) =>
    subjects.filter((s) => s.termType === 'NamedNode' && s.value.startsWith(BASE + prefix + '#'))
  const laminates = instances('laminat')
  const layups = instances('layup')
  const tapes = instances('tape')
  const points = instances('position').filter((t) => !t.equals(ORIGIN))
  const rename = (term, value) => {
    assert(!renames.has(term.value), `Multiple owners for ${term.value}`)
    renames.set(term.value, n(value))
  }
  for (const laminate of laminates) {
    const id = laminate.value.slice((BASE + 'laminat#').length)
    const document = `${BASE}data/laminate/${id}#`
    rename(laminate, document + 'it')
    const layup = only(source.getObjects(laminate, n(PROV + 'wasDerivedFrom'), null), 'layup')
    rename(layup, document + 'layup')
    const origin = only(
      source.getObjects(laminate, n(POS + 'hasPositionalReference'), null),
      'reference point',
    )
    assert(origin.equals(ORIGIN), 'Unexpected reference point; extend the migration explicitly')
    origins.set(laminate.value, n(document + 'origin'))
    const ownedPoints = source.getObjects(laminate, n(OLD_PARAM + 'hasNeedlePoint'), null)
    // Keep the existing numeric point IDs stable, including in extraction provenance.
    for (const point of ownedPoints) {
      const id = point.value.slice(POS.length)
      rename(point, document + 'needle-point-' + id)
      pointOrigins.set(point.value, origins.get(laminate.value))
    }
  }
  for (const tape of tapes) {
    rename(tape, `${BASE}data/tape/${tape.value.slice((BASE + 'tape#').length)}#it`)
  }
  assert.equal(layups.length, laminates.length, 'Unowned layups')
  assert.equal(pointOrigins.size, points.length, 'Unowned needle points')
  assert.equal(
    new Set([...renames.values()].map((t) => t.value)).size,
    renames.size,
    'IRI collision',
  )
  const mapped = (term) => {
    if (term.termType !== 'NamedNode') return term
    if (term.value.startsWith(OLD_PARAM)) return n(PARAM + term.value.slice(OLD_PARAM.length))
    return renames.get(term.value) ?? term
  }
  const layupIds = new Set(layups.map((t) => t.value))
  for (const q of source) {
    if (q.subject.equals(ORIGIN)) continue // Clone the shared reference metadata below.
    if (q.predicate.value === POS + 'hasPositionalReference') continue // Now belongs on each point.
    if (pointOrigins.has(q.subject.value) && q.predicate.value === PROV + 'wasDerivedFrom') {
      assert(q.object.equals(ORIGIN), 'Unexpected needle-point provenance')
      output.addQuad(
        mapped(q.subject),
        n(PARAM + 'referencePoint'),
        pointOrigins.get(q.subject.value),
      )
      continue
    }
    assert(!q.object.equals(ORIGIN), 'Unhandled incoming reference to the old origin')
    const predicate =
      layupIds.has(q.subject.value) && q.predicate.value === PROV + 'value'
        ? n(PARAM + 'tapeStack')
        : mapped(q.predicate)
    output.addQuad(mapped(q.subject), predicate, mapped(q.object), q.graph)
  }
  // Keep explicit superclass types from the source; add the new domain types.
  for (const [terms, type] of [
    [laminates, 'Laminate'],
    [layups, 'Layup'],
    [tapes, 'Tape'],
    [points, 'NeedlePoint'],
  ]) {
    for (const term of terms) output.addQuad(mapped(term), TYPE, n(FOR + type))
  }
  for (const origin of origins.values()) {
    for (const q of source.getQuads(ORIGIN, null, null, null)) {
      output.addQuad(
        origin,
        q.predicate,
        q.predicate.equals(TYPE) && q.object.value === POS + 'Origin'
          ? n(FOR + 'ReferencePoint')
          : q.object,
      )
    }
  }
  for (const [property, type] of [
    ['fiberOrientation', 'FiberOrientation'],
    ['hasFiberMassFraction', 'FiberMassFraction'],
  ]) {
    for (const q of output.getQuads(null, n(PARAM + property), null, null)) {
      output.addQuad(q.object, TYPE, n(FOR + type))
      if (type === 'FiberOrientation')
        output.addQuad(q.object, n(QUDT + 'hasQuantityKind'), n(KIND + 'PlaneAngle'))
    }
  }
  // Every old triple must survive its defined rewrite. Unrelated triples and all literals stay intact.
  for (const q of source) {
    if (q.subject.equals(ORIGIN) || q.predicate.value === POS + 'hasPositionalReference') continue
    const pointReference =
      pointOrigins.has(q.subject.value) && q.predicate.value === PROV + 'wasDerivedFrom'
    const predicate = pointReference
      ? n(PARAM + 'referencePoint')
      : layupIds.has(q.subject.value) && q.predicate.value === PROV + 'value'
        ? n(PARAM + 'tapeStack')
        : mapped(q.predicate)
    assert(
      output.has(
        quad(
          mapped(q.subject),
          predicate,
          pointReference ? pointOrigins.get(q.subject.value) : mapped(q.object),
          q.graph,
        ),
      ),
      'Lost source triple',
    )
  }
  for (const q of output) {
    for (const t of [q.subject, q.predicate, q.object]) {
      assert(
        t.termType !== 'NamedNode' ||
          ![OLD_PARAM, POS, BASE + 'laminat#', BASE + 'layup#', BASE + 'tape#'].some((prefix) =>
            t.value.startsWith(prefix),
          ),
        'Legacy material IRI remains',
      )
    }
  }
  return {
    output,
    counts: {
      laminates: laminates.length,
      layups: layups.length,
      tapes: tapes.length,
      needlePoints: points.length,
      referencePoints: origins.size,
    },
    renames,
  }
}

async function main() {
  const inputText = await readFile(dataUrl('material.ttl'), 'utf8')
  const source = new Store(new Parser({ blankNodePrefix: 'source_' }).parse(inputText))
  const { output, counts } = migrateMaterial(source)
  const prefixes = Object.fromEntries(
    [...inputText.matchAll(/^@prefix ([\w-]+): <([^>]+)> \./gm)].map((m) => [m[1], m[2]]),
  )
  for (const prefix of ['laminat', 'layup', 'tape', 'pos']) delete prefixes[prefix]
  Object.assign(prefixes, { for: FOR, param: PARAM, rdf: RDF })
  const writer = new Writer({ prefixes })
  // Make only data instance IRIs relative; keep vocabulary terms prefixed.
  const relative = (term) =>
    term.termType === 'NamedNode' && term.value.startsWith(BASE + 'data/')
      ? n(term.value.slice(BASE.length))
      : term
  writer.addQuads(
    [...output].map((q) =>
      quad(relative(q.subject), relative(q.predicate), relative(q.object), q.graph),
    ),
  )
  const serialized = await new Promise((resolve, reject) =>
    writer.end((error, text) => (error ? reject(error) : resolve(text))),
  )
  const header =
    '# Generated from material.ttl by transformations/migrate_material_v2.mjs.\n# Source values and extraction records are preserved; only material vocabulary and structure are aligned.\n'
  const text = header + '@base <' + BASE + '> .\n\n' + serialized
  const parsed = new Store(new Parser({ blankNodePrefix: '' }).parse(text))
  // Writer preserves explicit blank-node labels; check every triple after round-tripping.
  assert.equal(parsed.size, output.size)
  for (const q of output) assert(parsed.has(q), 'Serialization changed the graph')
  const shapes = new Store(
    new Parser().parse(await readFile(dataUrl('material-example.ttl'), 'utf8')),
  )
  const validator = new Validator(shapes, { factory: DataFactory, validations })
  // These shapes are local to a laminate's outgoing material structure. Validate each
  // complete closure separately to avoid repeating graph-wide SPARQL scans 141 times.
  const covered = new Set()
  const results = []
  const laminates = parsed.getSubjects(TYPE, n(FOR + 'Laminate'), null)
  for (const [index, laminate] of laminates.entries()) {
    const dataset = new Store()
    const queue = [laminate]
    const visited = new Set()
    while (queue.length) {
      const subject = queue.pop()
      if (visited.has(subject.id)) continue
      visited.add(subject.id)
      covered.add(subject.id)
      for (const q of parsed.getQuads(subject, null, null, null)) {
        dataset.add(q)
        if (
          q.object.termType === 'BlankNode' ||
          parsed.getObjects(q.object, TYPE, null).some((t) => t.value.startsWith(FOR))
        ) {
          queue.push(q.object)
        }
      }
    }
    const validation = await validator.validate({ dataset })
    results.push(...validation.results)
    if ((index + 1) % 20 === 0) console.log(`Validated ${index + 1}/${laminates.length} laminates`)
  }
  for (const q of parsed.getQuads(null, TYPE, null, null)) {
    if (q.object.value.startsWith(FOR))
      assert(covered.has(q.subject.id), 'Unvalidated domain instance')
  }
  const report = {
    source: 'data/material.ttl',
    output: 'data/material-v2.ttl',
    sourceTriples: source.size,
    outputTriples: output.size,
    ...counts,
    preservation:
      'Every source triple verified against its defined rewrite; serialized graph round-trip checked.',
    conforms: results.length === 0,
    violations: results.map((r) => ({
      focusNode: r.focusNode?.value,
      path: r.path?.flatMap((step) => step.predicates.map((p) => p.value)),
      value: r.value?.value,
      messages: r.message?.map((m) => m.value),
      constraint: r.constraintComponent?.value,
    })),
  }
  await writeFile(dataUrl('material-v2.ttl'), text)
  await writeFile(dataUrl('material-v2-validation.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

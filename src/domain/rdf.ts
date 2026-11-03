import { DataFactory as df, Parser, Store, Writer } from 'n3'
import type { Term, Quad, NamedNode } from '@rdfjs/types'

export const NS = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  wild: 'http://purl.org/wild/vocab#',
  for: 'http://purl.org/for/terms#',
  param: 'http://purl.org/for/parameter#',
  activity: 'http://purl.org/for/activity#',
  frame: 'http://purl.org/system/gripper-frame/1#',
  oven: 'http://purl.org/system/oven/1#',
  press: 'http://purl.org/system/press/1#',
  prov: 'http://www.w3.org/ns/prov#',
  sosa: 'http://www.w3.org/ns/sosa/',
  ssn: 'http://www.w3.org/ns/ssn/',
  qudt: 'http://qudt.org/schema/qudt/',
  unit: 'http://qudt.org/vocab/unit/',
  kind: 'http://qudt.org/vocab/quantitykind/',
  dcat: 'http://www.w3.org/ns/dcat#',
  dct: 'http://purl.org/dc/terms/',
  geo: 'http://www.opengis.net/ont/geosparql#',
  sh: 'http://www.w3.org/ns/shacl#',
} as const
export const BASE = 'http://purl.org/for/'
export const n = df.namedNode
export { df, Store }
export type { Term, Quad, NamedNode }
export const prefixes = Object.entries(NS)
  .map(([k, v]) => `PREFIX ${k}: <${v}>`)
  .join('\n')
export const parse = (text: string) => new Store(new Parser().parse(text))
export const serialize = (store: Store) =>
  new Writer({ format: 'N-Triples' }).quadsToString(store.getQuads(null, null, null, null))
export const objects = (g: Store, s: Term | string, p: string): Term[] =>
  g.getObjects(typeof s === 'string' ? n(s) : s, n(p), null)
export const object = (g: Store, s: Term | string | undefined, p: string): Term | undefined =>
  s ? objects(g, s, p)[0] : undefined
export const value = (g: Store, s: Term | string | undefined, p: string): string =>
  object(g, s, p)?.value ?? ''
export const subjects = (g: Store, p: string, o: Term | string): Term[] =>
  g.getSubjects(n(p), typeof o === 'string' ? n(o) : o, null)
export const typed = (g: Store, type: string) => subjects(g, NS.rdf + 'type', type)
export const isType = (g: Store, s: Term | string, type: string) =>
  objects(g, s, NS.rdf + 'type').some((t) => t.value === type)

export function list(g: Store, head: Term | undefined): Term[] {
  const result: Term[] = []
  const seen = new Set<string>()
  let current = head
  while (current && current.value !== NS.rdf + 'nil') {
    if (seen.has(current.value)) throw new Error('This ordered list contains a cycle.')
    seen.add(current.value)
    const first = objects(g, current, NS.rdf + 'first')
    const rest = objects(g, current, NS.rdf + 'rest')
    if (first.length !== 1 || rest.length !== 1) throw new Error('This ordered list is incomplete.')
    result.push(first[0]!)
    current = rest[0]
    if (result.length > 10000) throw new Error('This ordered list is too large to display.')
  }
  return result
}
export function addList(g: Store, items: Term[]): Term {
  let tail: Term = n(NS.rdf + 'nil')
  for (const item of [...items].reverse()) {
    const cell = df.blankNode()
    g.addQuad(cell, n(NS.rdf + 'first'), item as Quad['object'])
    g.addQuad(cell, n(NS.rdf + 'rest'), tail as Quad['object'])
    tail = cell
  }
  return tail
}
export function compact(iri: string): string {
  for (const [key, ns] of Object.entries(NS))
    if (iri.startsWith(ns)) return key + ':' + iri.slice(ns.length)
  return iri.startsWith(BASE) ? iri.slice(BASE.length) : iri
}
export function label(g: Store, s: Term | string | undefined): string {
  if (!s) return 'Not recorded'
  const term = typeof s === 'string' ? n(s) : s
  const labels = [...objects(g, term, NS.rdfs + 'label'), ...objects(g, term, NS.dct + 'title')]
  const preferred = labels.find(
    (t) => t.termType === 'Literal' && (t.language === 'en' || t.language === ''),
  )
  if (preferred || labels.length) return preferred?.value ?? labels[0]!.value
  const modelActivity = object(g, term, NS.wild + 'activityInstanceOf')
  if (modelActivity) {
    const activityLabel = objects(g, modelActivity, NS.rdfs + 'label')[0]
    if (activityLabel) return activityLabel.value
  }
  const equipment = term.value.match(/^http:\/\/purl.org\/for\/(sensor|system)\/([^/]+)\/(\d+)#it$/)
  if (equipment)
    return (
      human(equipment[2]!) +
      (equipment[1] === 'sensor' && !['camera', 'pyrometer'].includes(equipment[2]!)
        ? ' sensor'
        : '') +
      ' ' +
      equipment[3]
    )
  return compact(term.value)
}
export function human(iri: string): string {
  const local = iri.split(/[#/]/).pop() ?? iri
  return local.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}
export function unit(iri: string): string {
  const symbols: Record<string, string> = {
    MilliM: 'mm',
    KiloN: 'kN',
    DEG_C: '°C',
    SEC: 's',
    'MilliM-PER-SEC': 'mm/s',
    DEG: '°',
    PERCENT: '%',
    UNITLESS: 'unitless',
  }
  return symbols[iri.replace(NS.unit, '')] ?? compact(iri)
}
export function quantity(
  g: Store,
  s: Term | string | undefined,
): { value: string; unit: string; kind: string } {
  if (!s) return { value: '', unit: '', kind: '' }
  const magnitude = object(g, s, NS.qudt + 'value')
  let number = magnitude?.value ?? ''
  if (magnitude && magnitude.termType !== 'Literal') {
    try {
      number = list(g, magnitude)
        .map((t) => t.value)
        .join(', ')
    } catch {
      number = 'Invalid recorded list'
    }
  }
  return {
    value: number,
    unit: unit(value(g, s, NS.qudt + 'hasUnit')),
    kind: value(g, s, NS.qudt + 'hasQuantityKind'),
  }
}
export const dateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not recorded'
export function interval(start: string, end: string): string {
  if (!start || !end) return 'Duration not recorded'
  const seconds = (Date.parse(end) - Date.parse(start)) / 1000
  if (!Number.isFinite(seconds) || seconds < 0) return 'Invalid recorded interval'
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
export function safeIri(iri: string): string {
  if (!/^[a-z][a-z0-9+.-]*:[^<>"{}|^\x00-\x20\\]*$/i.test(iri))
    throw new Error('Invalid resource address.')
  return '<' + iri + '>'
}
export const textLiteral = (text: string) => JSON.stringify(text)
export function merge(...graphs: Store[]): Store {
  const result = new Store()
  for (const graph of graphs) result.addQuads(graph.getQuads(null, null, null, null))
  return result
}

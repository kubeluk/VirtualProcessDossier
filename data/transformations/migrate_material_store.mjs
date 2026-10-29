#!/usr/bin/env node
// Preview: node data/transformations/migrate_material_store.mjs
// Apply:   node data/transformations/migrate_material_store.mjs --apply --backup /tmp/vpd-before-material-v2.ttl
// Uses FUSEKI_ENDPOINT, FUSEKI_UPDATE_ENDPOINT, FUSEKI_USER, FUSEKI_PASSWORD if set.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { DataFactory, Parser, Store } from 'n3'
import { migrateMaterial } from './migrate_material_v2.mjs'

const base = 'http://purl.org/for/'
const n = DataFactory.namedNode
const rdfType = n('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
const endpoint = process.env.FUSEKI_ENDPOINT ?? 'http://localhost:3030/vpd/sparql'
const updateEndpoint = process.env.FUSEKI_UPDATE_ENDPOINT ?? 'http://localhost:3030/vpd/update'
const auth =
  'Basic ' +
  Buffer.from(
    `${process.env.FUSEKI_USER ?? 'admin'}:${process.env.FUSEKI_PASSWORD ?? 'admin'}`,
  ).toString('base64')
const url = new URL(endpoint)
url.searchParams.set('query', 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')
const response = await fetch(url, { headers: { Accept: 'text/turtle', Authorization: auth } })
if (!response.ok) throw new Error(`Backup query failed: HTTP ${response.status}`)
const snapshot = await response.text()
const graph = new Store(new Parser().parse(snapshot))
const roots = [
  ...new Map(
    [...graph]
      .filter((q) => q.subject.value.startsWith(base + 'laminat#'))
      .map((q) => [q.subject.value, q.subject]),
  ).values(),
]
const alreadyMigrated = graph.getSubjects(rdfType, n(base + 'terms#Laminate'), null).length
if (!roots.length && alreadyMigrated) {
  console.log(`Already migrated: ${alreadyMigrated} laminates. No changes made.`)
  process.exit(0)
}
assert(roots.length > 0, 'No legacy laminates found; check the endpoint')
assert.equal(alreadyMigrated, 0, 'Mixed legacy/v2 material data: inspect before migrating')

// Extract only material subjects and owned blank nodes; exclude machine plans, runs,
// parts, and other resources that happen to use the old parameter namespace.
const subset = new Store()
const queue = [...roots]
const seen = new Set()
while (queue.length) {
  const term = queue.pop()
  if (seen.has(term.id)) continue
  seen.add(term.id)
  for (const q of graph.getQuads(term, null, null, null)) {
    subset.add(q)
    if (
      q.object.termType === 'BlankNode' ||
      ['laminat#', 'layup#', 'tape#', 'position#'].some((prefix) =>
        q.object.value.startsWith(base + prefix),
      )
    )
      queue.push(q.object)
  }
}
const { renames, counts } = migrateMaterial(subset)
const pairs = [...renames].map(([old, next]) => `(<${old}> <${next.value}>)`).join('\n')
const classes = [...renames]
  .map(([old, next]) => {
    const type = old.startsWith(base + 'laminat#')
      ? 'Laminate'
      : old.startsWith(base + 'layup#')
        ? 'Layup'
        : old.startsWith(base + 'tape#')
          ? 'Tape'
          : 'NeedlePoint'
    return `<${next.value}> a for:${type} .`
  })
  .join('\n')
const origins = roots
  .map((root) => {
    const laminate = renames.get(root.value).value
    return `(<${laminate}> <${laminate.replace(/#it$/, '#origin')}>)`
  })
  .join('\n')
const update = `
PREFIX for: <${base}terms#>
PREFIX param: <${base}parameter#>
PREFIX old: <${base}param#>
PREFIX pos: <${base}position#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX qudt: <http://qudt.org/schema/qudt/>
PREFIX quantitykind: <http://qudt.org/vocab/quantitykind/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
# Rewrite all incoming/outgoing links, including links from runs and extraction records.
DELETE { ?old ?p ?o } INSERT { ?new ?p ?o }
WHERE { VALUES (?old ?new) { ${pairs} } ?old ?p ?o } ;
DELETE { ?s ?p ?old } INSERT { ?s ?p ?new }
WHERE { VALUES (?old ?new) { ${pairs} } ?s ?p ?old } ;
INSERT DATA { ${classes} } ;
DELETE { ?s ?old ?o } INSERT { ?s ?new ?o }
WHERE {
  VALUES (?old ?new) {
    (old:polymer param:polymer) (old:fiberType param:fiberType)
    (old:hasFiberMassFraction param:hasFiberMassFraction)
    (old:fiberOrientation param:fiberOrientation) (old:hasNeedlePoint param:hasNeedlePoint)
  }
  ?s ?old ?o
} ;
DELETE { ?layup prov:value ?list } INSERT { ?layup param:tapeStack ?list }
WHERE { ?layup a for:Layup ; prov:value ?list } ;
INSERT { ?quantity a for:FiberOrientation ; qudt:hasQuantityKind quantitykind:PlaneAngle }
WHERE { ?derivation param:fiberOrientation ?quantity } ;
INSERT { ?quantity a for:FiberMassFraction }
WHERE { ?tape a for:Tape ; param:hasFiberMassFraction ?quantity } ;
INSERT { ?origin ?p ?newObject }
WHERE {
  VALUES (?laminate ?origin) { ${origins} }
  pos:laminatReferencePoint ?p ?o .
  BIND(IF(?p = rdf:type && ?o = pos:Origin, for:ReferencePoint, ?o) AS ?newObject)
} ;
DELETE { ?point prov:wasDerivedFrom pos:laminatReferencePoint }
INSERT { ?point param:referencePoint ?origin }
WHERE {
  VALUES (?laminate ?origin) { ${origins} }
  ?laminate param:hasNeedlePoint ?point .
  ?point prov:wasDerivedFrom pos:laminatReferencePoint
} ;
DELETE { ?laminate pos:hasPositionalReference pos:laminatReferencePoint }
WHERE { ?laminate a for:Laminate ; pos:hasPositionalReference pos:laminatReferencePoint } ;
DELETE { pos:laminatReferencePoint ?p ?o }
WHERE {
  pos:laminatReferencePoint ?p ?o .
  FILTER NOT EXISTS { ?external ?link pos:laminatReferencePoint }
}
`
await writeFile('/tmp/vpd-material-v2-migration.ru', update)
console.log(
  JSON.stringify({ endpoint, ...counts, update: '/tmp/vpd-material-v2-migration.ru' }, null, 2),
)
if (!process.argv.includes('--apply')) {
  console.log('Preview only. Use --apply --backup <path> to migrate in one Fuseki update request.')
  process.exit(0)
}
const backup = process.argv[process.argv.indexOf('--backup') + 1]
assert(
  process.argv.includes('--backup') && backup && !backup.startsWith('--'),
  '--backup <path> is required',
)
await writeFile(backup, snapshot, { flag: 'wx' })
console.log(`Saved full default-graph backup: ${backup}`)
const result = await fetch(updateEndpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/sparql-update', Authorization: auth },
  body: update,
})
if (!result.ok) throw new Error(`Migration failed: HTTP ${result.status} ${await result.text()}`)
console.log(
  'Material migration applied. All other namespaces and machine parameter predicates preserved.',
)

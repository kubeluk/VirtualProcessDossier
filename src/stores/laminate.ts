import { orderedStack } from '@/services/material'
import { defineStore } from 'pinia'
import { useGraphStore } from '@/stores/graph'
import { askSparql, querySparql, updateSparql } from '@/services/sparql'
import {
  iri,
  laminateDelete,
  laminateTriples,
  LAMINATE_PREFIXES as prefixes,
  type LaminateForm,
} from '@/services/laminate'

export interface LaminateSummary {
  uri: string
  label: string
  identifier: string
}

export const useLaminateStore = defineStore('laminate', () => {
  const graph = useGraphStore()
  const query = (body: string) => querySparql(graph.endpoint, prefixes + body)

  async function fetchLaminates(): Promise<LaminateSummary[]> {
    const result = await query(`SELECT ?uri ?label ?identifier WHERE {
      ?uri a for:Laminate .
      OPTIONAL { ?uri rdfs:label ?label }
      OPTIONAL { ?uri dcterms:identifier ?identifier }
    } ORDER BY LCASE(STR(?label)) ?uri`)
    return result.results.bindings.map((b) => ({
      uri: b.uri.value,
      label: b.label?.value ?? b.uri.value,
      identifier: b.identifier?.value ?? '',
    }))
  }

  async function fetchLaminate(uri: string): Promise<LaminateForm> {
    const root = iri(uri)
    const [meta, dimensions, plies, points] = await Promise.all([
      query(`SELECT ?root ?label ?identifier ?layupLabel WHERE {
        ${root} a for:Laminate .
        BIND(${root} AS ?root)
        OPTIONAL { ${root} rdfs:label ?label }
        OPTIONAL { ${root} dcterms:identifier ?identifier }
        ${root} prov:wasDerivedFrom ?layup .
        ?layup a for:Layup .
        OPTIONAL { ?layup rdfs:label ?layupLabel }
      }`),
      query(
        `SELECT ?kind ?value WHERE { ${root} geo:hasSize [ qudt:hasQuantityKind ?kind ; qudt:value ?value ] }`,
      ),
      query(`SELECT DISTINCT ?cell ?next ?polymer ?fiberType ?massFraction ?orientation WHERE {
        ${root} prov:wasDerivedFrom ?layup .
        ?layup a for:Layup ; param:tapeStack/rdf:rest* ?cell ; prov:qualifiedDerivation ?derivation .
        ?cell rdf:first ?tape ; rdf:rest ?next .
        ?derivation prov:entity ?tape ; param:fiberOrientation/qudt:value ?orientation .
        ?tape a for:Tape ; param:polymer ?polymer ; param:fiberType ?fiberType ; param:hasFiberMassFraction/qudt:value ?massFraction .
      }`),
      query(`SELECT DISTINCT ?point ?x ?y ?reference ?referenceLabel WHERE {
        ${root} param:hasNeedlePoint ?point .
        ?point a for:NeedlePoint ; param:referencePoint ?reference ; qudt:quantityValue/qudt:value ?list .
        ?list rdf:first ?x ; rdf:rest/rdf:first ?y .
        OPTIONAL { ?reference rdfs:label ?referenceLabel }
      } ORDER BY ?point`),
    ])
    const m = meta.results.bindings[0]
    if (!m) throw new Error('Laminate was not found.')
    const size = (kind: string) => {
      const value = dimensions.results.bindings.find((b) => b.kind.value.endsWith('/' + kind))
        ?.value.value
      return value === undefined ? null : Number(value)
    }
    const ordered: LaminateForm['plies'] = orderedStack(plies.results.bindings).map((row) => ({
      polymer: row.polymer.value,
      fiberType: row.fiberType.value,
      massFraction: Number(row.massFraction.value),
      orientation: Number(row.orientation.value),
    }))
    if (!ordered.length) throw new Error('The laminate has an empty tape stack.')
    return {
      label: m.label?.value ?? '',
      identifier: m.identifier?.value ?? '',
      layupLabel: m.layupLabel?.value ?? '',
      length: size('Length'),
      width: size('Width'),
      thickness: size('Thickness'),
      plies: ordered,
      points: points.results.bindings.map((b) => ({
        x: Number(b.x.value),
        y: Number(b.y.value),
        referenceUri: b.reference.value,
        referenceLabel: b.referenceLabel?.value ?? '',
      })),
    }
  }

  async function isInUse(uri: string): Promise<boolean> {
    return askSparql(
      graph.endpoint,
      prefixes + `ASK { ?subject ?predicate ${iri(uri)} . FILTER(?subject != ${iri(uri)}) }`,
    )
  }

  async function saveLaminate(form: LaminateForm, existingUri?: string): Promise<string> {
    const revision = crypto.randomUUID()
    const uri = existingUri ?? `http://purl.org/for/data/laminate/${revision}#it`
    const triples = laminateTriples(uri, form, revision)
    // One update request keeps replacement atomic within Fuseki.
    await updateSparql(
      graph.updateEndpoint,
      prefixes +
        (existingUri
          ? laminateDelete(
              uri,
              form.points.flatMap((p) => (p.referenceUri ? [p.referenceUri] : [])),
            ) + ';\n'
          : '') +
        `INSERT DATA { ${triples} }`,
    )
    return uri
  }

  async function deleteLaminate(uri: string): Promise<void> {
    if (await isInUse(uri))
      throw new Error('This laminate is referenced by another record and cannot be deleted.')
    await updateSparql(graph.updateEndpoint, prefixes + laminateDelete(uri))
  }

  return { fetchLaminates, fetchLaminate, isInUse, saveLaminate, deleteLaminate }
})

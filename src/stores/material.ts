import { defineStore } from 'pinia'
import { groupedStacks, orderedStack, materialResourceId } from '@/services/material'
import { iri } from '@/services/laminate'
import { querySparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

export interface PartSummary {
  uri: string
  runUri: string
  runLabel: string | null
  runDescription: string | null
  laminatUri: string
  laminatLabel: string | null
  laminatId: string | null
  layupUri: string | null
  layupLabel: string | null
}

export interface LaminatProperty {
  kind: string
  kindLabel: string
  value: number
  unitSymbol: string
}

export interface PlySummary {
  tapeUri: string
  tapeId: string
  polymer: string | null
  fiberType: string | null
  orientation: number | null
  fiberMassFraction: number | null
}

export interface NeedlePoint {
  uri: string
  pointId: string
  x: number
  y: number
  referenceUri: string
  referenceLabel: string | null
}

export interface PartDetail extends PartSummary {
  properties: LaminatProperty[]
  plies: PlySummary[]
  needlePoints: NeedlePoint[]
}

const KIND_LABELS: Record<string, string> = {
  Length: 'Length',
  Width: 'Width',
  Thickness: 'Thickness',
}

const UNIT_SYMBOLS: Record<string, string> = {
  MilliM: 'mm',
  DEG: '°',
  PERCENT: '%',
  UNITLESS: '',
}

const PROP_ORDER = ['Length', 'Width', 'Thickness']

function localName(uri: string): string {
  const m = uri.match(/[#/]([^#/]+)$/)
  return m ? m[1] : uri
}

function kindLabel(uri: string): string {
  const k = localName(uri)
  return KIND_LABELS[k] ?? k
}

function unitSymbol(uri: string): string {
  const u = localName(uri)
  return UNIT_SYMBOLS[u] ?? u
}

export const useMaterialStore = defineStore('material', () => {
  const graphStore = useGraphStore()

  async function fetchParts(): Promise<PartSummary[]> {
    const query = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX geo:     <http://www.opengis.net/ont/geosparql#>

      SELECT ?part ?runUri ?runLabel ?runDesc ?laminatUri ?laminatLabel ?laminatId ?layupUri ?layupLabel WHERE {
        ?part a sosa:Sample ;
              sosa:isResultOf ?runUri ;
              prov:wasDerivedFrom ?laminatUri .
        ?laminatUri a for:Laminate .
        OPTIONAL { ?runUri rdfs:label ?runLabel }
        OPTIONAL { ?runUri rdfs:comment ?runDesc }
        OPTIONAL { ?laminatUri rdfs:label ?laminatLabel }
        OPTIONAL { ?laminatUri dcterms:identifier ?laminatId }
        OPTIONAL {
          ?laminatUri prov:wasDerivedFrom ?layupUri .
          OPTIONAL { ?layupUri rdfs:label ?layupLabel }
        }
      }
      ORDER BY ?part
    `
    const res = await querySparql(graphStore.endpoint, query)
    return [...new Map(res.results.bindings.map(b => [b.part.value, b])).values()].map((b) => ({
      uri: b.part.value,
      runUri: b.runUri.value,
      runLabel: b.runLabel?.value ?? null,
      runDescription: b.runDesc?.value ?? null,
      laminatUri: b.laminatUri.value,
      laminatLabel: b.laminatLabel?.value ?? null,
      laminatId: b.laminatId?.value ?? null,
      layupUri: b.layupUri?.value ?? null,
      layupLabel: b.layupLabel?.value ?? null,
    }))
  }

  async function fetchPartDetail(summary: PartSummary): Promise<PartDetail> {
    const { laminatUri } = summary

    const propQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX geo:   <http://www.opengis.net/ont/geosparql#>

      SELECT ?qk ?unit ?value WHERE {
        BIND(${iri(laminatUri)} AS ?laminat)
        ?laminat geo:hasSize ?node .
        ?node qudt:hasQuantityKind ?qk ;
              qudt:hasUnit ?unit ;
              qudt:value ?value .
      }
    `

    const plyQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX param: <http://purl.org/for/parameter#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?cell ?next ?tape ?polymer ?fiberType ?orientation ?fiberMassFraction WHERE {
        BIND(${iri(laminatUri)} AS ?laminat)
        ?laminat prov:wasDerivedFrom ?layup .
        ?layup a for:Layup ; param:tapeStack/rdf:rest* ?cell ; prov:qualifiedDerivation ?deriv .
        ?cell rdf:first ?tape ; rdf:rest ?next .
        ?tape a for:Tape .
        ?deriv prov:entity ?tape .
        OPTIONAL {
          ?deriv param:fiberOrientation ?orientNode .
          ?orientNode qudt:value ?orientation .
        }
        OPTIONAL { ?tape param:polymer ?polymer }
        OPTIONAL { ?tape param:fiberType ?fiberType }
        OPTIONAL { ?tape param:hasFiberMassFraction ?fracNode . ?fracNode qudt:value ?fiberMassFraction }
      }
    `

    const needleQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX param: <http://purl.org/for/parameter#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?pos ?x ?y ?reference ?referenceLabel WHERE {
        BIND(${iri(laminatUri)} AS ?laminat)
        ?laminat param:hasNeedlePoint ?pos .
        ?pos a for:NeedlePoint ; param:referencePoint ?reference ; qudt:quantityValue ?valNode .
        OPTIONAL { ?reference <http://www.w3.org/2000/01/rdf-schema#label> ?referenceLabel }
        ?valNode qudt:value ?coordList .
        ?coordList rdf:first ?x ;
                   rdf:rest/rdf:first ?y .
      }
      ORDER BY ?pos
    `

    const [propRes, plyRes, needleRes] = await Promise.all([
      querySparql(graphStore.endpoint, propQuery),
      querySparql(graphStore.endpoint, plyQuery),
      querySparql(graphStore.endpoint, needleQuery),
    ])

    const properties: LaminatProperty[] = propRes.results.bindings
      .map((b) => ({
        kind: localName(b.qk.value),
        kindLabel: kindLabel(b.qk.value),
        value: parseFloat(b.value.value),
        unitSymbol: unitSymbol(b.unit.value),
      }))
      .sort((a, b) => PROP_ORDER.indexOf(a.kind) - PROP_ORDER.indexOf(b.kind))

    const plies: PlySummary[] = orderedStack(plyRes.results.bindings).map((b) => ({
      tapeUri: b.tape.value,
      tapeId: materialResourceId(b.tape.value),
      polymer: b.polymer?.value ?? null,
      fiberType: b.fiberType?.value ?? null,
      orientation: b.orientation != null ? parseFloat(b.orientation.value) : null,
      fiberMassFraction: b.fiberMassFraction != null ? parseFloat(b.fiberMassFraction.value) : null,
    }))

    const needlePoints: NeedlePoint[] = needleRes.results.bindings.map((b) => ({
      uri: b.pos.value,
      pointId: materialResourceId(b.pos.value),
      x: parseFloat(b.x.value),
      y: parseFloat(b.y.value),
      referenceUri: b.reference.value,
      referenceLabel: b.referenceLabel?.value ?? null,
    }))

    return { ...summary, properties, plies, needlePoints }
  }

  // Fetches all parts with full detail in 4 parallel batch queries instead of 1+N×3
  async function fetchAllParts(): Promise<PartDetail[]> {
    const summaryQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX geo:     <http://www.opengis.net/ont/geosparql#>
      SELECT ?part ?runUri ?runLabel ?runDesc ?laminatUri ?laminatLabel ?laminatId ?layupUri ?layupLabel WHERE {
        ?part a sosa:Sample ;
              sosa:isResultOf ?runUri ;
              prov:wasDerivedFrom ?laminatUri .
        ?laminatUri a for:Laminate .
        OPTIONAL { ?runUri rdfs:label ?runLabel }
        OPTIONAL { ?runUri rdfs:comment ?runDesc }
        OPTIONAL { ?laminatUri rdfs:label ?laminatLabel }
        OPTIONAL { ?laminatUri dcterms:identifier ?laminatId }
        OPTIONAL {
          ?laminatUri prov:wasDerivedFrom ?layupUri .
          OPTIONAL { ?layupUri rdfs:label ?layupLabel }
        }
      }
      ORDER BY ?part
    `

    const propQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX geo:   <http://www.opengis.net/ont/geosparql#>
      PREFIX sosa:  <http://www.w3.org/ns/sosa/>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      SELECT ?laminat ?qk ?unit ?value WHERE {
        ?part a sosa:Sample ; prov:wasDerivedFrom ?laminat .
        ?laminat a for:Laminate .
        ?laminat geo:hasSize ?node .
        ?node qudt:hasQuantityKind ?qk ; qudt:hasUnit ?unit ; qudt:value ?value .
      }
    `

    const plyQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX param: <http://purl.org/for/parameter#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX sosa:  <http://www.w3.org/ns/sosa/>
      PREFIX geo:   <http://www.opengis.net/ont/geosparql#>
      SELECT DISTINCT ?laminat ?cell ?next ?tape ?polymer ?fiberType ?orientation ?fiberMassFraction WHERE {
        ?part a sosa:Sample ; prov:wasDerivedFrom ?laminat .
        ?laminat a for:Laminate ; prov:wasDerivedFrom ?layup .
        ?layup a for:Layup ; param:tapeStack/rdf:rest* ?cell ; prov:qualifiedDerivation ?deriv .
        ?cell rdf:first ?tape ; rdf:rest ?next .
        ?tape a for:Tape .
        ?deriv prov:entity ?tape .
        OPTIONAL { ?deriv param:fiberOrientation ?orientNode . ?orientNode qudt:value ?orientation }
        OPTIONAL { ?tape param:polymer ?polymer }
        OPTIONAL { ?tape param:fiberType ?fiberType }
        OPTIONAL { ?tape param:hasFiberMassFraction ?fracNode . ?fracNode qudt:value ?fiberMassFraction }
      }
    `

    const needleQuery = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX param: <http://purl.org/for/parameter#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX sosa:  <http://www.w3.org/ns/sosa/>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX geo:   <http://www.opengis.net/ont/geosparql#>
      SELECT DISTINCT ?laminat ?pos ?x ?y ?reference ?referenceLabel WHERE {
        ?part a sosa:Sample ; prov:wasDerivedFrom ?laminat .
        ?laminat a for:Laminate ; param:hasNeedlePoint ?pos .
        ?pos a for:NeedlePoint ; param:referencePoint ?reference ; qudt:quantityValue ?valNode .
        OPTIONAL { ?reference <http://www.w3.org/2000/01/rdf-schema#label> ?referenceLabel }
        ?valNode qudt:value ?coordList .
        ?coordList rdf:first ?x ; rdf:rest/rdf:first ?y .
      }
      ORDER BY ?laminat ?pos
    `

    const [summaryRes, propRes, plyRes, needleRes] = await Promise.all([
      querySparql(graphStore.endpoint, summaryQuery),
      querySparql(graphStore.endpoint, propQuery),
      querySparql(graphStore.endpoint, plyQuery),
      querySparql(graphStore.endpoint, needleQuery),
    ])

    const summaryRows = [...new Map(summaryRes.results.bindings.map(b => [b.part.value, b])).values()]
    const summaries: PartSummary[] = summaryRows.map((b) => ({
      uri: b.part.value,
      runUri: b.runUri.value,
      runLabel: b.runLabel?.value ?? null,
      runDescription: b.runDesc?.value ?? null,
      laminatUri: b.laminatUri.value,
      laminatLabel: b.laminatLabel?.value ?? null,
      laminatId: b.laminatId?.value ?? null,
      layupUri: b.layupUri?.value ?? null,
      layupLabel: b.layupLabel?.value ?? null,
    }))

    const propsByLaminat = new Map<string, LaminatProperty[]>()
    for (const b of propRes.results.bindings) {
      const laminat = b.laminat.value
      if (!propsByLaminat.has(laminat)) propsByLaminat.set(laminat, [])
      propsByLaminat.get(laminat)!.push({
        kind: localName(b.qk.value),
        kindLabel: kindLabel(b.qk.value),
        value: parseFloat(b.value.value),
        unitSymbol: unitSymbol(b.unit.value),
      })
    }
    for (const [, props] of propsByLaminat) {
      props.sort((a, b) => PROP_ORDER.indexOf(a.kind) - PROP_ORDER.indexOf(b.kind))
    }

    const seenTape = new Set<string>()
    const pliesByLaminat = new Map<string, PlySummary[]>()
    for (const b of [...groupedStacks(plyRes.results.bindings, 'laminat').values()].flat()) {
      const laminat = b.laminat.value
      const key = `${laminat}|${b.tape.value}`
      if (seenTape.has(key)) continue
      seenTape.add(key)
      if (!pliesByLaminat.has(laminat)) pliesByLaminat.set(laminat, [])
      pliesByLaminat.get(laminat)!.push({
        tapeUri: b.tape.value,
        tapeId: materialResourceId(b.tape.value),
        polymer: b.polymer?.value ?? null,
        fiberType: b.fiberType?.value ?? null,
        orientation: b.orientation != null ? parseFloat(b.orientation.value) : null,
        fiberMassFraction: b.fiberMassFraction != null ? parseFloat(b.fiberMassFraction.value) : null,
      })
    }

    const needlesByLaminat = new Map<string, NeedlePoint[]>()
    for (const b of needleRes.results.bindings) {
      const laminat = b.laminat.value
      if (!needlesByLaminat.has(laminat)) needlesByLaminat.set(laminat, [])
      needlesByLaminat.get(laminat)!.push({
        uri: b.pos.value,
        pointId: materialResourceId(b.pos.value),
        x: parseFloat(b.x.value),
        y: parseFloat(b.y.value),
        referenceUri: b.reference.value,
        referenceLabel: b.referenceLabel?.value ?? null,
      })
    }

    return summaries.map((s) => ({
      ...s,
      properties: propsByLaminat.get(s.laminatUri) ?? [],
      plies: pliesByLaminat.get(s.laminatUri) ?? [],
      needlePoints: needlesByLaminat.get(s.laminatUri) ?? [],
    }))
  }

  async function fetchPartForRun(runUri: string): Promise<string | null> {
    const query = `
      PREFIX for: <http://purl.org/for/terms#>
      PREFIX sosa: <http://www.w3.org/ns/sosa/>
      SELECT ?part WHERE { ?part sosa:isResultOf ${iri(runUri)} . } LIMIT 1
    `
    const res = await querySparql(graphStore.endpoint, query)
    return res.results.bindings[0]?.part?.value ?? null
  }

  return { fetchParts, fetchPartDetail, fetchAllParts, fetchPartForRun }
})

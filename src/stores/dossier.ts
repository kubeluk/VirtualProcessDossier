import { defineStore } from 'pinia'
import { querySparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'
import { QUDT_UNIT_LABELS } from '@/stores/workflow'

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DossierHeadlineParam {
  label: string
  value: string
}

export interface DossierActivity {
  actInstUri: string
  modelActivityUri: string
  title: string | null
  machineLabel: string | null
  hasPlan: boolean
  keyParams: DossierHeadlineParam[]
}

export interface DossierData {
  partUri: string

  runUri: string
  runLabel: string | null
  runDate: string | null
  runState: string | null

  workflowUri: string | null
  workflowLabel: string | null

  laminatLabel: string | null
  laminatId: string | null
  length: number | null
  width: number | null
  thickness: number | null
  dimUnit: string
  fiberMassFraction: number | null

  layupLabel: string | null
  plies: Array<{ fiberType: string | null; polymer: string | null; orientation: number | null }>

  activities: DossierActivity[]
  datasets: Array<{ uri: string; title: string | null }>
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const PARAM_DISPLAY: Record<string, string> = {
  'http://purl.org/for/param#temperatureGoal': 'Temperature',
  'http://purl.org/for/param#pressForce': 'Press force',
  'http://purl.org/for/param#coolingTime': 'Cooling time',
  'http://purl.org/for/param#holdingTime': 'Holding time',
}

// Preferred display order for headline params
const PARAM_ORDER = [
  'http://purl.org/for/param#temperatureGoal',
  'http://purl.org/for/param#pressForce',
  'http://purl.org/for/param#holdingTime',
  'http://purl.org/for/param#coolingTime',
]

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDossierStore = defineStore('dossier', () => {
  const graphStore = useGraphStore()

  function unitSym(uri: string | undefined | null): string {
    if (!uri) return ''
    return QUDT_UNIT_LABELS[uri] ?? ''
  }

  function fmtNum(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.?0+$/, '')
  }

  function fmtVal(v: number, unitUri?: string | null): string {
    const sym = unitSym(unitUri)
    return sym ? `${fmtNum(v)} ${sym}` : fmtNum(v)
  }

  async function fetchDossier(partUri: string): Promise<DossierData | null> {
    // ── Phase 1: discover run / laminat / model URIs ────────────────────────
    const q1 = `
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX rdfs:    <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX geo:     <http://www.opengis.net/ont/geosparql#>
      SELECT ?runUri ?runLabel ?runState ?runStarted
             ?modelUri ?modelLabel
             ?laminatUri ?laminatLabel ?laminatId
             ?layupUri ?layupLabel WHERE {
        BIND(<${partUri}> AS ?part)
        ?part sosa:isResultOf ?runUri ;
              prov:wasDerivedFrom ?laminatUri .
        ?laminatUri a geo:Feature .
        OPTIONAL { ?runUri rdfs:label ?runLabel }
        OPTIONAL { ?runUri wild:hasState ?runState }
        OPTIONAL { ?runUri prov:startedAtTime ?runStarted }
        OPTIONAL {
          ?runUri wild:workflowInstanceOf ?modelUri .
          OPTIONAL { ?modelUri rdfs:label ?modelLabel }
        }
        OPTIONAL { ?laminatUri rdfs:label ?laminatLabel }
        OPTIONAL { ?laminatUri dcterms:identifier ?laminatId }
        OPTIONAL {
          ?laminatUri prov:wasDerivedFrom ?layupUri .
          OPTIONAL { ?layupUri rdfs:label ?layupLabel }
        }
      }
    `
    const r1 = await querySparql(graphStore.endpoint, q1)
    if (!r1.results.bindings.length) return null

    const h = r1.results.bindings[0]
    const runUri = h.runUri.value
    const laminatUri = h.laminatUri.value
    const modelUri = h.modelUri?.value ?? null

    // ── Phase 2: parallel queries ───────────────────────────────────────────

    // Laminat dimensions + fiber mass fraction
    const q_props = `
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX geo:   <http://www.opengis.net/ont/geosparql#>
      PREFIX param: <http://purl.org/for/param#>
      SELECT ?qk ?unit ?value WHERE {
        BIND(<${laminatUri}> AS ?laminat)
        {
          ?laminat geo:hasSize ?node .
          ?node qudt:hasQuantityKind ?qk ; qudt:hasUnit ?unit ; qudt:value ?value .
        } UNION {
          ?laminat param:hasFiberMassFraction ?node .
          ?node qudt:hasQuantityKind ?qk ; qudt:hasUnit ?unit ; qudt:value ?value .
        }
      }
    `

    // Ply stack
    const q_plies = `
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX qudt:  <http://qudt.org/schema/qudt/>
      PREFIX param: <http://purl.org/for/param#>
      SELECT ?tape ?polymer ?fiberType ?orientation WHERE {
        BIND(<${laminatUri}> AS ?laminat)
        ?laminat prov:wasDerivedFrom ?layup .
        ?layup prov:qualifiedDerivation ?deriv .
        ?deriv prov:entity ?tape .
        OPTIONAL { ?deriv param:fiberOrientation ?orientNode . ?orientNode qudt:value ?orientation }
        OPTIONAL { ?tape param:polymer ?polymer }
        OPTIONAL { ?tape param:fiberType ?fiberType }
      }
      ORDER BY ?tape
    `

    // Model activity tree for ordering (only if model URI is known)
    const q_tree = modelUri ? `
      PREFIX wild:  <http://purl.org/wild/vocab#>
      PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
      SELECT DISTINCT ?parent ?parentType ?child ?childTitle ?childType WHERE {
        <${modelUri}> wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)* ?parent .
        ?parent wild:hasChildActivities/rdf:rest*/rdf:first ?child .
        OPTIONAL { ?child rdfs:label ?childTitle }
        OPTIONAL {
          ?child a ?childType .
          FILTER(STRSTARTS(STR(?childType), 'http://purl.org/wild/vocab#'))
        }
        OPTIONAL {
          ?parent a ?parentType .
          FILTER(STRSTARTS(STR(?parentType), 'http://purl.org/wild/vocab#'))
        }
      }
    ` : null

    // Activity instances: machine + plan indicator
    const q_acts = `
      PREFIX wild:  <http://purl.org/wild/vocab#>
      PREFIX sosa:  <http://www.w3.org/ns/sosa/>
      PREFIX prov:  <http://www.w3.org/ns/prov#>
      PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
      SELECT ?actInst ?modelAct ?machine ?machineLabel ?plan WHERE {
        ?actInst wild:inWorkflowInstance <${runUri}> ;
                 wild:activityInstanceOf ?modelAct .
        FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }
        OPTIONAL {
          ?actInst prov:qualifiedAssociation ?assoc .
          ?assoc prov:agent ?machine .
          OPTIONAL { ?machine rdfs:label ?machineLabel }
          OPTIONAL { ?assoc prov:hadPlan ?plan }
        }
      }
    `

    // Headline params: specific predicates only + temperature goals from sub-plans
    const q_params = `
      PREFIX wild:   <http://purl.org/wild/vocab#>
      PREFIX sosa:   <http://www.w3.org/ns/sosa/>
      PREFIX prov:   <http://www.w3.org/ns/prov#>
      PREFIX qudt:   <http://qudt.org/schema/qudt/>
      PREFIX param:  <http://purl.org/for/param#>
      SELECT ?actInst ?paramPred ?value ?unit WHERE {
        ?actInst wild:inWorkflowInstance <${runUri}> .
        FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }
        {
          ?actInst prov:qualifiedAssociation ?assoc .
          ?assoc prov:hadPlan ?plan .
          ?plan ?paramPred ?qty .
          ?qty a <http://qudt.org/schema/qudt/Quantity> ; qudt:value ?value .
          FILTER(isLiteral(?value))
          FILTER(?paramPred IN (
            param:pressForce,
            param:coolingTime,
            param:holdingTime
          ))
          OPTIONAL { ?qty qudt:hasUnit ?unit }
        }
        UNION
        {
          ?actInst prov:qualifiedAssociation ?assoc .
          ?assoc prov:hadPlan ?plan .
          ?plan prov:hadMember ?subPlan .
          ?subPlan param:temperatureGoal ?entity .
          ?entity prov:value ?qty .
          ?qty qudt:value ?value .
          FILTER(isLiteral(?value))
          OPTIONAL { ?qty qudt:hasUnit ?unit }
          BIND(param:temperatureGoal AS ?paramPred)
        }
      }
    `

    // Gripper count (number of sub-plans with gripper positions)
    const q_grip = `
      PREFIX wild:   <http://purl.org/wild/vocab#>
      PREFIX sosa:   <http://www.w3.org/ns/sosa/>
      PREFIX prov:   <http://www.w3.org/ns/prov#>
      PREFIX param:  <http://purl.org/for/param#>
      SELECT ?actInst (COUNT(DISTINCT ?subPlan) AS ?n) WHERE {
        ?actInst wild:inWorkflowInstance <${runUri}> .
        FILTER NOT EXISTS { ?actInst sosa:hasResult ?_ }
        ?actInst prov:qualifiedAssociation ?assoc .
        ?assoc prov:hadPlan ?plan .
        ?plan prov:hadMember ?subPlan .
        ?subPlan param:gripperPosition ?_ .
      }
      GROUP BY ?actInst
    `

    // Datasets generated by the run (via prov:wasGeneratedBy) or linked to an activity instance
    const q_ds = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      SELECT DISTINCT ?ds ?title WHERE {
        {
          ?ds prov:wasGeneratedBy <${runUri}> .
        } UNION {
          ?actInst wild:inWorkflowInstance <${runUri}> .
          ?ds dcterms:isPartOf ?actInst .
        }
        OPTIONAL { ?ds dcterms:title ?title }
      }
      ORDER BY ?ds
    `

    const parallelQueries: Promise<Awaited<ReturnType<typeof querySparql>>>[] = [
      querySparql(graphStore.endpoint, q_props),
      querySparql(graphStore.endpoint, q_plies),
      ...(q_tree ? [querySparql(graphStore.endpoint, q_tree)] : []),
      querySparql(graphStore.endpoint, q_acts),
      querySparql(graphStore.endpoint, q_params),
      querySparql(graphStore.endpoint, q_grip),
      querySparql(graphStore.endpoint, q_ds),
    ]

    const results = await Promise.all(parallelQueries)
    let idx = 0
    const r_props = results[idx++]
    const r_plies = results[idx++]
    const r_tree = q_tree ? results[idx++] : null
    const r_acts = results[idx++]
    const r_params = results[idx++]
    const r_grip = results[idx++]
    const r_ds = results[idx++]

    // ── Parse laminat properties ─────────────────────────────────────────────
    let length: number | null = null
    let width: number | null = null
    let thickness: number | null = null
    let dimUnit = 'mm'
    let fiberMassFraction: number | null = null

    for (const b of r_props.results.bindings) {
      const kind = b.qk.value.split(/[/#]/).pop() ?? ''
      const val = parseFloat(b.value.value)
      const uSym = unitSym(b.unit?.value)
      if (kind === 'Length') { length = val; dimUnit = uSym || 'mm' }
      else if (kind === 'Width') width = val
      else if (kind === 'Thickness') thickness = val
      else if (kind === 'MassFraction') fiberMassFraction = val
    }

    // ── Parse plies ──────────────────────────────────────────────────────────
    const plies = r_plies.results.bindings.map((b) => ({
      fiberType: b.fiberType?.value ?? null,
      polymer: b.polymer?.value ?? null,
      orientation: b.orientation != null ? parseFloat(b.orientation.value) : null,
    }))

    // ── Build ordered atomic activity URIs from model tree ──────────────────
    const childrenMap = new Map<string, string[]>()
    const typeMap = new Map<string, string>()
    const titleMap = new Map<string, string | null>()

    if (r_tree) {
      for (const b of r_tree.results.bindings) {
        const parent = b.parent.value
        const child = b.child.value
        const rawParentType = b.parentType?.value?.replace('http://purl.org/wild/vocab#', '') ?? null
        const rawChildType = b.childType?.value?.replace('http://purl.org/wild/vocab#', '') ?? null

        if (!childrenMap.has(parent)) childrenMap.set(parent, [])
        const siblings = childrenMap.get(parent)!
        if (!siblings.includes(child)) siblings.push(child)

        // Store parent type so collectAtomics can correctly drill into composite roots
        if (!typeMap.has(parent)) typeMap.set(parent, rawParentType ?? 'SequentialActivity')
        if (!typeMap.has(child)) typeMap.set(child, rawChildType ?? 'AtomicActivity')
        if (!titleMap.has(child)) titleMap.set(child, b.childTitle?.value ?? null)
      }
    }

    function collectAtomics(uri: string): string[] {
      const type = typeMap.get(uri) ?? 'AtomicActivity'
      if (type === 'AtomicActivity') return [uri]
      return (childrenMap.get(uri) ?? []).flatMap(collectAtomics)
    }

    // Root = appears as parent but not as child
    const allChildSet = new Set<string>()
    for (const children of childrenMap.values()) children.forEach((c) => allChildSet.add(c))
    const treeRoots = [...childrenMap.keys()].filter((k) => !allChildSet.has(k))
    const orderedAtomicUris: string[] = treeRoots.flatMap(collectAtomics)

    // ── Build activity instance map ──────────────────────────────────────────
    const actInstByModel = new Map<string, { uri: string; machineLabel: string | null; hasPlan: boolean }>()
    for (const b of r_acts.results.bindings) {
      const modelAct = b.modelAct.value
      if (!actInstByModel.has(modelAct)) {
        actInstByModel.set(modelAct, {
          uri: b.actInst.value,
          machineLabel: b.machineLabel?.value ?? null,
          hasPlan: !!b.plan?.value,
        })
      }
    }

    // ── Collect headline params per activity instance ────────────────────────
    const paramsByActInst = new Map<string, DossierHeadlineParam[]>()
    const seenParamKey = new Set<string>()

    for (const b of r_params.results.bindings) {
      const actInst = b.actInst.value
      const pred = b.paramPred.value
      const val = parseFloat(b.value.value)
      const formatted = fmtVal(val, b.unit?.value)
      const dedupKey = `${actInst}|${pred}|${formatted}`
      if (seenParamKey.has(dedupKey)) continue
      seenParamKey.add(dedupKey)

      if (!paramsByActInst.has(actInst)) paramsByActInst.set(actInst, [])
      paramsByActInst.get(actInst)!.push({
        label: PARAM_DISPLAY[pred] ?? pred.split(/[/#]/).pop() ?? pred,
        value: formatted,
      })
    }

    // Add gripper count
    for (const b of r_grip.results.bindings) {
      const actInst = b.actInst.value
      if (!paramsByActInst.has(actInst)) paramsByActInst.set(actInst, [])
      paramsByActInst.get(actInst)!.unshift({ label: 'Grippers', value: b.n.value })
    }

    // Sort params within each activity by preferred display order
    for (const [actInst, params] of paramsByActInst.entries()) {
      paramsByActInst.set(
        actInst,
        [...params].sort((a, b) => {
          const ai = PARAM_ORDER.findIndex((p) => PARAM_DISPLAY[p] === a.label)
          const bi = PARAM_ORDER.findIndex((p) => PARAM_DISPLAY[p] === b.label)
          if (a.label === 'Grippers') return -1
          if (b.label === 'Grippers') return 1
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
        }),
      )
    }

    // ── Assemble DossierActivity list in model tree order ────────────────────
    const activities: DossierActivity[] = orderedAtomicUris.map((modelActUri) => {
      const inst = actInstByModel.get(modelActUri)
      const actInstUri = inst?.uri ?? modelActUri
      return {
        actInstUri,
        modelActivityUri: modelActUri,
        title: titleMap.get(modelActUri) ?? null,
        machineLabel: inst?.machineLabel ?? null,
        hasPlan: inst?.hasPlan ?? false,
        keyParams: paramsByActInst.get(actInstUri) ?? [],
      }
    })

    const datasets = r_ds.results.bindings.map((b) => ({
      uri: b.ds.value,
      title: b.title?.value ?? null,
    }))

    return {
      partUri,
      runUri,
      runLabel: h.runLabel?.value ?? null,
      runDate: h.runStarted?.value ?? null,
      runState: h.runState?.value?.replace('http://purl.org/wild/vocab#', '') ?? null,
      workflowUri: modelUri,
      workflowLabel: h.modelLabel?.value ?? null,
      laminatLabel: h.laminatLabel?.value ?? null,
      laminatId: h.laminatId?.value ?? null,
      length,
      width,
      thickness,
      dimUnit,
      fiberMassFraction,
      layupLabel: h.layupLabel?.value ?? null,
      plies,
      activities,
      datasets,
    }
  }

  return { fetchDossier }
})

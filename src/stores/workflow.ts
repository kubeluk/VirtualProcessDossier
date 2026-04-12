import { defineStore } from 'pinia'
import { querySparql, askSparql, updateSparql } from '@/services/sparql'
import { useGraphStore } from '@/stores/graph'

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface WorkflowStepDataset {
  uri: string
  title: string | null
  description: string | null
}

// ---------------------------------------------------------------------------
// WorkflowModel types
// ---------------------------------------------------------------------------

export interface WorkflowSummary {
  uri: string
  title: string
  description: string | null
  issued: string | null
}

export interface WorkflowStep {
  uri: string
  title: string | null
  description: string | null
  type: string | null
  systemUri: string | null
  systemTitle: string | null
  inputUri: string | null
  inputTitle: string | null
  children: WorkflowStep[]
}

export interface WorkflowDetail {
  uri: string
  title: string
  description: string | null
  issued: string | null
  steps: WorkflowStep[]
}

// ---------------------------------------------------------------------------
// WorkflowInstance / Run types
// ---------------------------------------------------------------------------

export interface WorkflowInstanceSummary {
  uri: string
  title: string | null
  description: string | null
  state: string | null  // 'active' | 'done' | null
  started: string | null
}

export interface RunActivityInstance {
  uri: string
  title: string | null
  modelActivityUri: string
  datasets: WorkflowStepDataset[]
}

export interface RunStep {
  uri: string           // model step URI (for title, type, step number)
  title: string | null
  description: string | null
  type: string | null
  activityInstances: RunActivityInstance[]
}

export interface RunDetail {
  uri: string           // workflow instance URI
  title: string | null
  description: string | null
  state: string | null
  started: string | null
  modelUri: string
  modelTitle: string | null
  steps: RunStep[]
  crossCuttingDatasets: WorkflowStepDataset[]
}

// ---------------------------------------------------------------------------
// AddWorkflowModel form types
// ---------------------------------------------------------------------------

export interface StepForm {
  uri?: string   // present when loaded from an existing resource
  title: string
  description: string
  type: 'AtomicActivity' | 'ParallelActivity' | 'SequentialActivity'
  systemUri?: string  // ssn:implementedBy target; only on AtomicActivity
  inputUri?: string   // ssn:hasInput target; only on AtomicActivity
  isLibraryRef?: boolean  // true when this step reuses an existing library activity
  children: StepForm[]
}

export interface ProcedureOption {
  uri: string
  title: string | null
  description: string | null
}

export interface AddWorkflowForm {
  title: string
  description: string
  rootType: 'SequentialActivity' | 'ParallelActivity'
  steps: StepForm[]
}

// ---------------------------------------------------------------------------
// AtomicActivity library types
// ---------------------------------------------------------------------------

export interface AtomicActivitySummary {
  uri: string
  title: string | null
  description: string | null
  systemUri: string | null
  systemTitle: string | null
  inputUri: string | null
  inputTitle: string | null
}

export interface AtomicActivityOption {
  uri: string
  title: string | null
  description: string | null
  systemUri: string | null
  inputUri: string | null
}

export interface AtomicActivityForm {
  title: string
  description: string
  systemUri: string   // '' = none
  inputUri: string    // '' = none
}

// ---------------------------------------------------------------------------
// Step-picker option (used by AddDatasetModal)
// ---------------------------------------------------------------------------

export interface WorkflowStepOption {
  uri: string
  label: string
  workflowUri: string
  workflowTitle: string | null
  workflowInstanceUri: string | null
  parentStepUri: string | null
  parentStepTitle: string | null
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkflowStore = defineStore('workflow', () => {
  const graphStore = useGraphStore()

  // ── WorkflowModel queries ────────────────────────────────────────────────

  async function fetchWorkflows(): Promise<WorkflowSummary[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?workflow ?title ?description ?issued WHERE {
        ?workflow a wild:WorkflowModel .
        OPTIONAL { ?workflow dcterms:title ?title }
        OPTIONAL { ?workflow dcterms:description ?description }
        OPTIONAL { ?workflow dcterms:issued ?issued }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.workflow.value,
      title: b.title?.value ?? b.workflow.value,
      description: b.description?.value ?? null,
      issued: b.issued?.value ?? null,
    }))
  }

  async function fetchWorkflow(uri: string): Promise<WorkflowDetail | null> {
    // Query 1: workflow metadata + root behaviour URI
    const metaQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?wfTitle ?wfDesc ?wfIssued ?root WHERE {
        BIND(<${uri}> AS ?wf)
        ?wf dcterms:title ?wfTitle .
        OPTIONAL { ?wf dcterms:description ?wfDesc }
        OPTIONAL { ?wf dcterms:issued ?wfIssued }
        OPTIONAL { ?wf wild:hasBehaviour ?root }
      }
    `

    // Query 2: all parent→child pairs in the activity tree.
    // (path)* traverses the root + all composite descendants so every
    // direct parent-child edge is captured regardless of nesting depth.
    // Uses a literal URI (not BIND) to avoid the Jena BIND+UNION issue.
    const treeQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>

      SELECT DISTINCT ?parent ?child ?childTitle ?childDesc ?childType
                      ?childSystem ?childSystemTitle ?childInput ?childInputTitle WHERE {
        <${uri}> wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)* ?parent .
        ?parent wild:hasChildActivities/rdf:rest*/rdf:first ?child .
        OPTIONAL { ?child dcterms:title ?childTitle }
        OPTIONAL { ?child dcterms:description ?childDesc }
        OPTIONAL {
          ?child a ?childType .
          FILTER(STRSTARTS(STR(?childType), 'http://purl.org/wild/vocab#'))
        }
        OPTIONAL {
          ?child ssn:implementedBy ?childSystem .
          OPTIONAL { ?childSystem dcterms:title ?childSystemTitle }
        }
        OPTIONAL {
          ?child ssn:hasInput ?childInput .
          OPTIONAL { ?childInput dcterms:title ?childInputTitle }
        }
      }
    `

    const [metaResults, treeResults] = await Promise.all([
      querySparql(graphStore.endpoint, metaQuery),
      querySparql(graphStore.endpoint, treeQuery),
    ])

    if (metaResults.results.bindings.length === 0) return null
    const first = metaResults.results.bindings[0]
    const rootUri = first.root?.value ?? null

    if (!rootUri) {
      return {
        uri,
        title: first.wfTitle.value,
        description: first.wfDesc?.value ?? null,
        issued: first.wfIssued?.value ?? null,
        steps: [],
      }
    }

    // Build node-metadata and children maps from tree query results
    type NodeMeta = {
      title: string | null
      desc: string | null
      type: string | null
      systemUri: string | null
      systemTitle: string | null
      inputUri: string | null
      inputTitle: string | null
    }
    const nodeMeta = new Map<string, NodeMeta>()
    // childrenMap: parentUri → ordered list of child URIs (insertion = SPARQL result order)
    const childrenMap = new Map<string, string[]>()

    for (const b of treeResults.results.bindings) {
      const parentUri = b.parent.value
      const childUri = b.child.value
      const rawType = b.childType?.value ?? null

      if (!nodeMeta.has(childUri)) {
        nodeMeta.set(childUri, {
          title: b.childTitle?.value ?? null,
          desc: b.childDesc?.value ?? null,
          type: rawType ? rawType.replace('http://purl.org/wild/vocab#', '') : null,
          systemUri: b.childSystem?.value ?? null,
          systemTitle: b.childSystemTitle?.value ?? null,
          inputUri: b.childInput?.value ?? null,
          inputTitle: b.childInputTitle?.value ?? null,
        })
      }
      if (!childrenMap.has(parentUri)) childrenMap.set(parentUri, [])
      const siblings = childrenMap.get(parentUri)!
      if (!siblings.includes(childUri)) siblings.push(childUri)
    }

    function buildStep(nodeUri: string): WorkflowStep {
      const meta = nodeMeta.get(nodeUri) ?? {
        title: null, desc: null, type: null,
        systemUri: null, systemTitle: null, inputUri: null, inputTitle: null,
      }
      const childUris = childrenMap.get(nodeUri) ?? []
      return {
        uri: nodeUri,
        title: meta.title,
        description: meta.desc,
        type: meta.type,
        systemUri: meta.systemUri,
        systemTitle: meta.systemTitle,
        inputUri: meta.inputUri,
        inputTitle: meta.inputTitle,
        children: childUris.map(buildStep),
      }
    }

    const topLevelUris = childrenMap.get(rootUri) ?? []
    const steps = topLevelUris.map(buildStep)

    return {
      uri,
      title: first.wfTitle.value,
      description: first.wfDesc?.value ?? null,
      issued: first.wfIssued?.value ?? null,
      steps,
    }
  }

  // ── WorkflowInstance / Run queries ───────────────────────────────────────

  async function fetchWorkflowInstances(modelUri: string): Promise<WorkflowInstanceSummary[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov:    <http://www.w3.org/ns/prov#>

      SELECT ?instance ?title ?description ?state ?started WHERE {
        ?instance a wild:WorkflowInstance ;
                  wild:workflowInstanceOf <${modelUri}> .
        OPTIONAL { ?instance dcterms:title ?title }
        OPTIONAL { ?instance dcterms:description ?description }
        OPTIONAL { ?instance wild:hasState ?state }
        OPTIONAL { ?instance prov:startedAtTime ?started }
      }
      ORDER BY DESC(?started)
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.instance.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
      state: b.state?.value?.replace('http://purl.org/wild/vocab#', '') ?? null,
      started: b.started?.value ?? null,
    }))
  }

  async function fetchRun(uri: string): Promise<RunDetail | null> {
    // Query 1: run metadata + model step skeleton
    const mainQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX prov:    <http://www.w3.org/ns/prov#>

      SELECT ?instTitle ?instDesc ?instState ?instStarted
             ?modelUri ?modelTitle
             ?step ?stepTitle ?stepDesc ?stepType
      WHERE {
        BIND(<${uri}> AS ?instance)
        ?instance a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?modelUri .
        OPTIONAL { ?instance dcterms:title ?instTitle }
        OPTIONAL { ?instance dcterms:description ?instDesc }
        OPTIONAL { ?instance wild:hasState ?instState }
        OPTIONAL { ?instance prov:startedAtTime ?instStarted }
        OPTIONAL { ?modelUri dcterms:title ?modelTitle }
        OPTIONAL {
          ?modelUri wild:hasBehaviour ?root .
          ?root wild:hasChildActivities/rdf:rest*/rdf:first ?step .
          OPTIONAL { ?step dcterms:title ?stepTitle }
          OPTIONAL { ?step dcterms:description ?stepDesc }
          OPTIONAL {
            ?step a ?stepType .
            FILTER(STRSTARTS(STR(?stepType), 'http://purl.org/wild/vocab#'))
          }
        }
      }
    `

    // Query 2: activity instances + datasets for this run.
    // Uses a literal URI (not BIND) to avoid the Jena BIND-in-UNION issue.
    // Also resolves parent step for leaf activities under parallel steps.
    const activitiesQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?actInst ?actInstTitle ?modelActivity ?parentStep ?dataset ?datasetTitle ?datasetDesc
      WHERE {
        ?actInst wild:inWorkflowInstance <${uri}> ;
                 wild:activityInstanceOf ?modelActivity .
        OPTIONAL { ?actInst dcterms:title ?actInstTitle }
        OPTIONAL {
          ?parentStep wild:hasChildActivities/rdf:rest*/rdf:first ?modelActivity .
        }
        OPTIONAL {
          ?dataset dcterms:isPartOf ?actInst .
          OPTIONAL { ?dataset dcterms:title ?datasetTitle }
          OPTIONAL { ?dataset dcterms:description ?datasetDesc }
        }
      }
    `

    // Query 3: cross-cutting datasets linked directly to this run
    const crossCuttingQuery = `
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?dataset ?datasetTitle ?datasetDesc WHERE {
        ?dataset dcterms:isPartOf <${uri}> .
        OPTIONAL { ?dataset dcterms:title ?datasetTitle }
        OPTIONAL { ?dataset dcterms:description ?datasetDesc }
      }
    `

    const [mainResults, activitiesResults, crossResults] = await Promise.all([
      querySparql(graphStore.endpoint, mainQuery),
      querySparql(graphStore.endpoint, activitiesQuery),
      querySparql(graphStore.endpoint, crossCuttingQuery),
    ])

    if (mainResults.results.bindings.length === 0) return null
    const first = mainResults.results.bindings[0]

    // Build step skeleton from main query
    const stepsMap = new Map<string, RunStep>()
    for (const b of mainResults.results.bindings) {
      if (!b.step) continue
      const stepUri = b.step.value
      if (!stepsMap.has(stepUri)) {
        const rawType = b.stepType?.value ?? null
        stepsMap.set(stepUri, {
          uri: stepUri,
          title: b.stepTitle?.value ?? null,
          description: b.stepDesc?.value ?? null,
          type: rawType ? rawType.replace('http://purl.org/wild/vocab#', '') : null,
          activityInstances: [],
        })
      }
    }

    // Build activity instance map (deduplicate datasets per instance)
    const actInstMap = new Map<string, RunActivityInstance>()
    for (const b of activitiesResults.results.bindings) {
      const actUri = b.actInst.value
      if (!actInstMap.has(actUri)) {
        actInstMap.set(actUri, {
          uri: actUri,
          title: b.actInstTitle?.value ?? null,
          modelActivityUri: b.modelActivity.value,
          datasets: [],
        })
      }
      if (b.dataset) {
        const act = actInstMap.get(actUri)!
        if (!act.datasets.some((d) => d.uri === b.dataset!.value)) {
          act.datasets.push({
            uri: b.dataset.value,
            title: b.datasetTitle?.value ?? null,
            description: b.datasetDesc?.value ?? null,
          })
        }
      }
    }

    // Attach activity instances to their parent step (deduplicating per step)
    const attachedActInsts = new Set<string>()
    for (const b of activitiesResults.results.bindings) {
      const actUri = b.actInst.value
      if (attachedActInsts.has(actUri)) continue
      attachedActInsts.add(actUri)

      const actInst = actInstMap.get(actUri)!
      // Use parentStep only when it is itself a top-level step (parallel leaf case).
      // For top-level atomic steps the parentStep is the root behaviour, which is
      // not in stepsMap, so we fall back to the model activity URI directly.
      const parentStepUri = b.parentStep?.value ?? null
      const targetStepUri =
        parentStepUri && stepsMap.has(parentStepUri) ? parentStepUri : b.modelActivity.value
      if (stepsMap.has(targetStepUri)) {
        stepsMap.get(targetStepUri)!.activityInstances.push(actInst)
      }
    }

    const steps = [...stepsMap.values()].sort((a, b) => {
      const nA = parseInt(a.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      const nB = parseInt(b.title?.match(/^Step (\d+)/)?.[1] ?? '99')
      return nA - nB
    })

    const crossCuttingDatasets = crossResults.results.bindings.map((b) => ({
      uri: b.dataset.value,
      title: b.datasetTitle?.value ?? null,
      description: b.datasetDesc?.value ?? null,
    }))

    return {
      uri,
      title: first.instTitle?.value ?? null,
      description: first.instDesc?.value ?? null,
      state: first.instState?.value?.replace('http://purl.org/wild/vocab#', '') ?? null,
      started: first.instStarted?.value ?? null,
      modelUri: first.modelUri.value,
      modelTitle: first.modelTitle?.value ?? null,
      steps,
      crossCuttingDatasets,
    }
  }

  async function updateWorkflowInstance(
    instanceUri: string,
    title: string,
    description: string,
  ): Promise<void> {
    const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const escapedDesc = description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const descTriple = description.trim()
      ? `<${instanceUri}> dcterms:description "${escapedDesc}"@en .`
      : ''
    const update = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      DELETE {
        <${instanceUri}> dcterms:title ?oldTitle .
        <${instanceUri}> dcterms:description ?oldDesc .
      }
      INSERT {
        <${instanceUri}> dcterms:title "${escapedTitle}"@en .
        ${descTriple}
      }
      WHERE {
        OPTIONAL { <${instanceUri}> dcterms:title ?oldTitle }
        OPTIONAL { <${instanceUri}> dcterms:description ?oldDesc }
      }
    `
    await updateSparql(graphStore.updateEndpoint, update)
  }

  // ── Fetch workflow data for editing ─────────────────────────────────────

  async function fetchWorkflowForEdit(uri: string): Promise<AddWorkflowForm | null> {
    // Same two-query approach as fetchWorkflow to support arbitrary depth.
    const metaQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?wfTitle ?wfDesc ?root ?rootType WHERE {
        BIND(<${uri}> AS ?wf)
        ?wf dcterms:title ?wfTitle .
        OPTIONAL { ?wf dcterms:description ?wfDesc }
        OPTIONAL {
          ?wf wild:hasBehaviour ?root .
          OPTIONAL { ?root a ?rootType . FILTER(STRSTARTS(STR(?rootType), 'http://purl.org/wild/vocab#')) }
        }
      }
    `
    const treeQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>

      SELECT DISTINCT ?parent ?child ?childTitle ?childDesc ?childType ?childSystem ?childInput ?childIssued WHERE {
        <${uri}> wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)* ?parent .
        ?parent wild:hasChildActivities/rdf:rest*/rdf:first ?child .
        OPTIONAL { ?child dcterms:title ?childTitle }
        OPTIONAL { ?child dcterms:description ?childDesc }
        OPTIONAL {
          ?child a ?childType .
          FILTER(STRSTARTS(STR(?childType), 'http://purl.org/wild/vocab#'))
        }
        OPTIONAL { ?child ssn:implementedBy ?childSystem }
        OPTIONAL { ?child ssn:hasInput ?childInput }
        OPTIONAL { ?child dcterms:issued ?childIssued }
      }
    `

    const [metaResults, treeResults] = await Promise.all([
      querySparql(graphStore.endpoint, metaQuery),
      querySparql(graphStore.endpoint, treeQuery),
    ])

    if (metaResults.results.bindings.length === 0) return null
    const first = metaResults.results.bindings[0]
    const rootUri = first.root?.value ?? null

    const rawRootType = first.rootType?.value?.replace('http://purl.org/wild/vocab#', '') ?? ''
    const rootType: AddWorkflowForm['rootType'] =
      rawRootType === 'ParallelActivity' ? 'ParallelActivity' : 'SequentialActivity'

    if (!rootUri) {
      return { title: first.wfTitle.value, description: first.wfDesc?.value ?? '', rootType: 'SequentialActivity', steps: [] }
    }

    type NodeMeta = { title: string | null; desc: string | null; type: string | null; systemUri: string | null; inputUri: string | null; isLibraryRef: boolean }
    const nodeMeta = new Map<string, NodeMeta>()
    const childrenMap = new Map<string, string[]>()

    for (const b of treeResults.results.bindings) {
      const parentUri = b.parent.value
      const childUri = b.child.value
      const rawType = b.childType?.value ?? null
      if (!nodeMeta.has(childUri)) {
        nodeMeta.set(childUri, {
          title: b.childTitle?.value ?? null,
          desc: b.childDesc?.value ?? null,
          type: rawType ? rawType.replace('http://purl.org/wild/vocab#', '') : null,
          systemUri: b.childSystem?.value ?? null,
          inputUri: b.childInput?.value ?? null,
          isLibraryRef: !!b.childIssued?.value,
        })
      }
      if (!childrenMap.has(parentUri)) childrenMap.set(parentUri, [])
      const siblings = childrenMap.get(parentUri)!
      if (!siblings.includes(childUri)) siblings.push(childUri)
    }

    function sortedChildren(parentUri: string): string[] {
      return [...(childrenMap.get(parentUri) ?? [])].sort((a, b) => {
        const tA = nodeMeta.get(a)?.title ?? ''
        const tB = nodeMeta.get(b)?.title ?? ''
        const nA = parseInt(tA.match(/^Step\s+(\d+)/i)?.[1] ?? '0')
        const nB = parseInt(tB.match(/^Step\s+(\d+)/i)?.[1] ?? '0')
        if (nA !== nB) return nA - nB
        return tA.localeCompare(tB)
      })
    }

    function buildStepForm(nodeUri: string): StepForm {
      const meta = nodeMeta.get(nodeUri) ?? { title: null, desc: null, type: null, systemUri: null, inputUri: null, isLibraryRef: false }
      const rawType = meta.type ?? 'AtomicActivity'
      const type: StepForm['type'] =
        rawType === 'ParallelActivity' ? 'ParallelActivity' :
        rawType === 'SequentialActivity' ? 'SequentialActivity' : 'AtomicActivity'
      return {
        uri: nodeUri,
        title: meta.title ?? '',
        description: meta.desc ?? '',
        type,
        ...(meta.systemUri ? { systemUri: meta.systemUri } : {}),
        ...(meta.inputUri ? { inputUri: meta.inputUri } : {}),
        isLibraryRef: meta.isLibraryRef,
        children: sortedChildren(nodeUri).map(buildStepForm),
      }
    }

    const steps = sortedChildren(rootUri).map(buildStepForm)
    return { title: first.wfTitle.value, description: first.wfDesc?.value ?? '', rootType, steps }
  }

  // ── Update workflow model (only allowed when no runs exist) ───────────────

  async function updateWorkflowModel(uri: string, form: AddWorkflowForm): Promise<void> {
    const suffix = Date.now().toString(36)
    const slug = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workflow'

    const base = 'https://example.org/vpd#'
    const rootUri = `${base}wfbeh-${slug}-${suffix}`
    const now = new Date().toISOString()
    let nodeCounter = 0
    let listCounter = 0

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    function buildList(items: string[]): [string, string] {
      const p = `L${listCounter++}`
      const head = `_:${p}n0`
      const triples = items
        .map((item, i) => {
          const rest = i < items.length - 1 ? `_:${p}n${i + 1}` : 'rdf:nil'
          return `  _:${p}n${i} rdf:first <${item}> .\n  _:${p}n${i} rdf:rest ${rest} .`
        })
        .join('\n')
      return [head, triples]
    }

    const insertLines: string[] = []

    insertLines.push(`  <${uri}> a wild:WorkflowModel .`)
    insertLines.push(`  <${uri}> dcterms:title "${esc(form.title)}"@en .`)
    if (form.description.trim()) {
      insertLines.push(`  <${uri}> dcterms:description "${esc(form.description)}"@en .`)
    }
    insertLines.push(`  <${uri}> wild:hasBehaviour <${rootUri}> .`)

    function generateNode(step: StepForm, nodeUri: string): void {
      if (step.isLibraryRef) return  // library ref: URI is in the list but triples already exist
      const title = step.title.trim()
      insertLines.push(`  <${nodeUri}> a wild:${step.type} .`)
      insertLines.push(`  <${nodeUri}> dcterms:title "${esc(title)}"@en .`)
      if (step.description.trim()) {
        insertLines.push(`  <${nodeUri}> dcterms:description "${esc(step.description)}"@en .`)
      }
      if (step.type === 'AtomicActivity') {
        insertLines.push(`  <${nodeUri}> a sosa:Procedure .`)
        insertLines.push(`  <${nodeUri}> dcterms:issued "${now}"^^xsd:dateTime .`)
        if (step.systemUri) insertLines.push(`  <${nodeUri}> ssn:implementedBy <${step.systemUri}> .`)
        if (step.inputUri) insertLines.push(`  <${nodeUri}> ssn:hasInput <${step.inputUri}> .`)
      }
      if (step.type !== 'AtomicActivity' && step.children.length > 0) {
        const childUris = step.children.map((child) =>
          (child.isLibraryRef && child.uri) ? child.uri : `${base}wfact-${slug}-${suffix}-${nodeCounter++}`
        )
        const [head, listTriples] = buildList(childUris)
        insertLines.push(`  <${nodeUri}> wild:hasChildActivities ${head} .`)
        insertLines.push(listTriples)
        step.children.forEach((child, i) => generateNode(child, childUris[i]))
      }
    }

    const stepUris = form.steps.map((step) =>
      (step.isLibraryRef && step.uri) ? step.uri : `${base}step-${slug}-${suffix}-${nodeCounter++}`
    )
    const [rootHead, rootListTriples] = buildList(stepUris)
    insertLines.push(`  <${rootUri}> a wild:${form.rootType} .`)
    insertLines.push(`  <${rootUri}> wild:hasChildActivities ${rootHead} .`)
    insertLines.push(rootListTriples)
    form.steps.forEach((step, i) => generateNode(step, stepUris[i]))

    const update = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>

      DELETE { <${uri}> ?p ?o }
      WHERE { <${uri}> ?p ?o . FILTER(?p != dcterms:issued) } ;

      DELETE { ?root ?p ?o }
      WHERE { <${uri}> wild:hasBehaviour ?root . ?root ?p ?o } ;

      DELETE { ?desc ?p ?o }
      WHERE {
        <${uri}> wild:hasBehaviour ?root .
        ?root (wild:hasChildActivities/rdf:rest*/rdf:first)+ ?desc .
        ?desc ?p ?o
        FILTER NOT EXISTS { ?desc dcterms:issued ?_ }
      } ;

      DELETE { ?node rdf:first ?f . ?node rdf:rest ?r }
      WHERE {
        <${uri}> wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)* ?comp .
        ?comp wild:hasChildActivities/rdf:rest* ?node .
        ?node rdf:first ?f .
        ?node rdf:rest ?r
      } ;

      INSERT DATA {
${insertLines.join('\n')}
      }
    `

    await updateSparql(graphStore.updateEndpoint, update)
  }

  // ── Update workflow model metadata (safe when runs exist) ────────────────
  // Only updates dcterms:title and dcterms:description on the workflow model
  // and each existing step / leaf activity. The structural RDF (types, lists,
  // hasBehaviour) is untouched.

  async function updateWorkflowModelMetadata(uri: string, form: AddWorkflowForm): Promise<void> {
    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    function metaOp(resourceUri: string, newTitle: string, newDesc: string): string {
      const descInsert = newDesc.trim()
        ? `<${resourceUri}> dcterms:description "${esc(newDesc)}"@en .`
        : ''
      return `
        DELETE { <${resourceUri}> dcterms:title ?t . <${resourceUri}> dcterms:description ?d }
        INSERT { <${resourceUri}> dcterms:title "${esc(newTitle)}"@en . ${descInsert} }
        WHERE  { OPTIONAL { <${resourceUri}> dcterms:title ?t }
                 OPTIONAL { <${resourceUri}> dcterms:description ?d } }`
    }

    function ssnOp(resourceUri: string, systemUri: string | undefined, inputUri: string | undefined): string {
      const sysInsert = systemUri ? `<${resourceUri}> ssn:implementedBy <${systemUri}> .` : ''
      const inpInsert = inputUri ? `<${resourceUri}> ssn:hasInput <${inputUri}> .` : ''
      return `
        DELETE { <${resourceUri}> ssn:implementedBy ?sys . <${resourceUri}> ssn:hasInput ?inp }
        INSERT { ${sysInsert} ${inpInsert} }
        WHERE  { OPTIONAL { <${resourceUri}> ssn:implementedBy ?sys }
                 OPTIONAL { <${resourceUri}> ssn:hasInput ?inp } }`
    }

    const ops: string[] = []
    ops.push(metaOp(uri, form.title, form.description))

    function collectOps(step: StepForm): void {
      if (!step.uri) return
      if (step.isLibraryRef) return  // library activities are managed from the activity library
      ops.push(metaOp(step.uri, step.title.trim(), step.description))
      if (step.type === 'AtomicActivity') {
        ops.push(ssnOp(step.uri, step.systemUri, step.inputUri))
      }
      step.children.forEach((child) => collectOps(child))
    }

    form.steps.forEach((step) => collectOps(step))

    const update = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      ${ops.join(' ;\n')}
    `

    await updateSparql(graphStore.updateEndpoint, update)
  }

  // ── Create workflow model ────────────────────────────────────────────────

  async function addWorkflowModel(form: AddWorkflowForm): Promise<string> {
    const suffix = Date.now().toString(36)
    const slug = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'workflow'

    const base = 'https://example.org/vpd#'
    const workflowUri = `${base}workflow-${slug}-${suffix}`
    const rootUri = `${base}wfbeh-${slug}-${suffix}`
    const now = new Date().toISOString()
    let nodeCounter = 0
    let listCounter = 0

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    function buildList(items: string[]): [string, string] {
      const p = `L${listCounter++}`
      const head = `_:${p}n0`
      const triples = items
        .map((item, i) => {
          const rest = i < items.length - 1 ? `_:${p}n${i + 1}` : 'rdf:nil'
          return `  _:${p}n${i} rdf:first <${item}> .\n  _:${p}n${i} rdf:rest ${rest} .`
        })
        .join('\n')
      return [head, triples]
    }

    const lines: string[] = []

    lines.push(`  <${workflowUri}> a wild:WorkflowModel .`)
    lines.push(`  <${workflowUri}> dcterms:title "${esc(form.title)}"@en .`)
    if (form.description.trim()) {
      lines.push(`  <${workflowUri}> dcterms:description "${esc(form.description)}"@en .`)
    }
    lines.push(`  <${workflowUri}> dcterms:issued "${now}"^^xsd:dateTime .`)
    lines.push(`  <${workflowUri}> wild:hasBehaviour <${rootUri}> .`)

    function generateNode(step: StepForm, nodeUri: string): void {
      if (step.isLibraryRef) return  // library ref: URI is in the list but triples already exist
      const title = step.title.trim()
      lines.push(`  <${nodeUri}> a wild:${step.type} .`)
      lines.push(`  <${nodeUri}> dcterms:title "${esc(title)}"@en .`)
      if (step.description.trim()) {
        lines.push(`  <${nodeUri}> dcterms:description "${esc(step.description)}"@en .`)
      }
      if (step.type === 'AtomicActivity') {
        lines.push(`  <${nodeUri}> a sosa:Procedure .`)
        lines.push(`  <${nodeUri}> dcterms:issued "${now}"^^xsd:dateTime .`)
        if (step.systemUri) lines.push(`  <${nodeUri}> ssn:implementedBy <${step.systemUri}> .`)
        if (step.inputUri) lines.push(`  <${nodeUri}> ssn:hasInput <${step.inputUri}> .`)
      }
      if (step.type !== 'AtomicActivity' && step.children.length > 0) {
        const childUris = step.children.map((child) =>
          (child.isLibraryRef && child.uri) ? child.uri : `${base}wfact-${slug}-${suffix}-${nodeCounter++}`
        )
        const [head, listTriples] = buildList(childUris)
        lines.push(`  <${nodeUri}> wild:hasChildActivities ${head} .`)
        lines.push(listTriples)
        step.children.forEach((child, i) => generateNode(child, childUris[i]))
      }
    }

    const stepUris = form.steps.map((step) =>
      (step.isLibraryRef && step.uri) ? step.uri : `${base}step-${slug}-${suffix}-${nodeCounter++}`
    )
    const [rootHead, rootListTriples] = buildList(stepUris)
    lines.push(`  <${rootUri}> a wild:${form.rootType} .`)
    lines.push(`  <${rootUri}> wild:hasChildActivities ${rootHead} .`)
    lines.push(rootListTriples)
    form.steps.forEach((step, i) => generateNode(step, stepUris[i]))

    const update = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>

      INSERT DATA {
${lines.join('\n')}
      }
    `

    await updateSparql(graphStore.updateEndpoint, update)
    return workflowUri
  }

  // ── Create workflow run (WorkflowInstance + ActivityInstances) ──────────

  async function addWorkflowRun(
    modelUri: string,
    title: string,
    description: string,
  ): Promise<string> {
    // Query all activities in the model: root behaviour + all descendants
    const activityQuery = `
      PREFIX wild: <http://purl.org/wild/vocab#>
      PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT ?root ?activity WHERE {
        <${modelUri}> wild:hasBehaviour ?root .
        ?root (wild:hasChildActivities/rdf:rest*/rdf:first)* ?activity .
      }
    `
    const activityResults = await querySparql(graphStore.endpoint, activityQuery)

    const suffix = Date.now().toString(36)
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'run'
    const base = 'https://example.org/vpd#'
    const instanceUri = `${base}wfinst-${slug}-${suffix}`
    const now = new Date().toISOString()

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    const lines: string[] = []

    // WorkflowInstance
    lines.push(`  <${instanceUri}> a wild:WorkflowInstance .`)
    lines.push(`  <${instanceUri}> wild:workflowInstanceOf <${modelUri}> .`)
    lines.push(`  <${instanceUri}> dcterms:title "${esc(title)}"@en .`)
    if (description.trim()) {
      lines.push(`  <${instanceUri}> dcterms:description "${esc(description)}"@en .`)
    }
    lines.push(`  <${instanceUri}> prov:startedAtTime "${now}"^^xsd:dateTime .`)
    lines.push(`  <${instanceUri}> wild:hasState wild:initialized .`)

    // ActivityInstances: one per activity node, root gets wild:active
    let actCounter = 0
    let rootUri: string | null = null

    for (const b of activityResults.results.bindings) {
      if (!rootUri) rootUri = b.root.value
      const actUri = b.activity.value
      const actInstUri = `${base}actinst-${slug}-${suffix}-${actCounter++}`
      const isRoot = actUri === rootUri

      lines.push(`  <${actInstUri}> a wild:ActivityInstance .`)
      lines.push(`  <${actInstUri}> wild:activityInstanceOf <${actUri}> .`)
      lines.push(`  <${actInstUri}> wild:inWorkflowInstance <${instanceUri}> .`)
      lines.push(`  <${actInstUri}> wild:hasState ${isRoot ? 'wild:active' : 'wild:initialized'} .`)
    }

    const update = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX prov:    <http://www.w3.org/ns/prov#>
      PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>

      INSERT DATA {
${lines.join('\n')}
      }
    `

    await updateSparql(graphStore.updateEndpoint, update)
    return instanceUri
  }

  // ── System / Input option lists (for workflow authoring selects) ─────────

  async function fetchSystemOptions(): Promise<ProcedureOption[]> {
    const query = `
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?uri ?title ?description WHERE {
        ?uri a ssn:System .
        OPTIONAL { ?uri dcterms:title ?title }
        OPTIONAL { ?uri dcterms:description ?description }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.uri.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
    }))
  }

  async function fetchInputOptions(): Promise<ProcedureOption[]> {
    const query = `
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      SELECT ?uri ?title ?description WHERE {
        ?uri a ssn:Input .
        OPTIONAL { ?uri dcterms:title ?title }
        OPTIONAL { ?uri dcterms:description ?description }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.uri.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
    }))
  }

  // ── Step-picker options (for AddDatasetModal) ────────────────────────────
  // Returns model activity URIs so new observations can set activityInstanceOf correctly.
  // When instanceUri is provided the results are already scoped to that run's model;
  // when omitted all models are returned (used when the modal is opened globally).

  async function fetchWorkflowStepOptions(instanceUri?: string): Promise<WorkflowStepOption[]> {
    const instanceJoin = instanceUri
      ? `BIND(<${instanceUri}> AS ?wfInst) ?wfInst wild:workflowInstanceOf ?wfModel .`
      : `?wfModel a wild:WorkflowModel .
        OPTIONAL {
          ?wfInst a wild:WorkflowInstance ;
                  wild:workflowInstanceOf ?wfModel .
        }`

    const stepQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?step ?stepTitle ?stepType ?wfModel ?wfTitle ?wfInst WHERE {
        ${instanceJoin}
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        ?wfModel wild:hasBehaviour ?root .
        ?root wild:hasChildActivities/rdf:rest*/rdf:first ?step .
        OPTIONAL { ?step dcterms:title ?stepTitle }
        OPTIONAL {
          ?step a ?stepType .
          FILTER(STRSTARTS(STR(?stepType), 'http://purl.org/wild/vocab#'))
        }
      }
      ORDER BY ?wfTitle ?stepTitle
    `

    const leafQuery = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?leaf ?leafTitle ?parentStep ?parentTitle ?wfModel ?wfTitle ?wfInst WHERE {
        ${instanceJoin}
        OPTIONAL { ?wfModel dcterms:title ?wfTitle }
        ?wfModel wild:hasBehaviour ?root .
        ?root wild:hasChildActivities/rdf:rest*/rdf:first ?parentStep .
        ?parentStep a wild:ParallelActivity ;
                    wild:hasChildActivities/rdf:rest*/rdf:first ?leaf .
        OPTIONAL { ?parentStep dcterms:title ?parentTitle }
        OPTIONAL { ?leaf dcterms:title ?leafTitle }
      }
      ORDER BY ?wfTitle ?parentTitle ?leafTitle
    `

    const [stepResults, leafResults] = await Promise.all([
      querySparql(graphStore.endpoint, stepQuery),
      querySparql(graphStore.endpoint, leafQuery),
    ])

    const workflowsSeen = new Map<string, { title: string | null; instanceUri: string | null }>()
    const options: WorkflowStepOption[] = []

    for (const b of stepResults.results.bindings) {
      const wfUri = b.wfModel.value
      if (!workflowsSeen.has(wfUri)) {
        workflowsSeen.set(wfUri, {
          title: b.wfTitle?.value ?? null,
          instanceUri: b.wfInst?.value ?? null,
        })
      }
      const stepType = b.stepType?.value?.replace('http://purl.org/wild/vocab#', '') ?? null
      if (stepType === 'ParallelActivity') continue
      options.push({
        uri: b.step.value,
        label: b.stepTitle?.value ?? b.step.value,
        workflowUri: wfUri,
        workflowTitle: b.wfTitle?.value ?? null,
        workflowInstanceUri: b.wfInst?.value ?? null,
        parentStepUri: null,
        parentStepTitle: null,
      })
    }

    for (const b of leafResults.results.bindings) {
      const wfUri = b.wfModel.value
      if (!workflowsSeen.has(wfUri)) {
        workflowsSeen.set(wfUri, {
          title: b.wfTitle?.value ?? null,
          instanceUri: b.wfInst?.value ?? null,
        })
      }
      options.push({
        uri: b.leaf.value,
        label: b.leafTitle?.value ?? b.leaf.value,
        workflowUri: wfUri,
        workflowTitle: b.wfTitle?.value ?? null,
        workflowInstanceUri: b.wfInst?.value ?? null,
        parentStepUri: b.parentStep?.value ?? null,
        parentStepTitle: b.parentTitle?.value ?? null,
      })
    }

    const fullWorkflowOptions: WorkflowStepOption[] = [...workflowsSeen.entries()].map(
      ([uri, meta]) => ({
        uri,
        label: 'Full workflow run (cross-cutting)',
        workflowUri: uri,
        workflowTitle: meta.title,
        workflowInstanceUri: meta.instanceUri,
        parentStepUri: null,
        parentStepTitle: null,
      }),
    )

    return [...fullWorkflowOptions, ...options]
  }

  // ── AtomicActivity library ───────────────────────────────────────────────
  // Library activities are wild:AtomicActivity resources created independently
  // (not inline as part of a workflow model). They are identified by having
  // dcterms:issued set at creation time.

  async function fetchAtomicActivities(): Promise<AtomicActivitySummary[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>

      SELECT ?activity ?title ?description ?system ?systemTitle ?input ?inputTitle WHERE {
        ?activity a wild:AtomicActivity ;
                  dcterms:issued ?_ .
        OPTIONAL { ?activity dcterms:title ?title }
        OPTIONAL { ?activity dcterms:description ?description }
        OPTIONAL {
          ?activity ssn:implementedBy ?system .
          OPTIONAL { ?system dcterms:title ?systemTitle }
        }
        OPTIONAL {
          ?activity ssn:hasInput ?input .
          OPTIONAL { ?input dcterms:title ?inputTitle }
        }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.activity.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
      systemUri: b.system?.value ?? null,
      systemTitle: b.systemTitle?.value ?? null,
      inputUri: b.input?.value ?? null,
      inputTitle: b.inputTitle?.value ?? null,
    }))
  }

  async function fetchAtomicActivityOptions(): Promise<AtomicActivityOption[]> {
    const query = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>

      SELECT ?activity ?title ?description ?system ?input WHERE {
        ?activity a wild:AtomicActivity ;
                  dcterms:issued ?_ .
        OPTIONAL { ?activity dcterms:title ?title }
        OPTIONAL { ?activity dcterms:description ?description }
        OPTIONAL { ?activity ssn:implementedBy ?system }
        OPTIONAL { ?activity ssn:hasInput ?input }
      }
      ORDER BY ?title
    `
    const results = await querySparql(graphStore.endpoint, query)
    return results.results.bindings.map((b) => ({
      uri: b.activity.value,
      title: b.title?.value ?? null,
      description: b.description?.value ?? null,
      systemUri: b.system?.value ?? null,
      inputUri: b.input?.value ?? null,
    }))
  }

  async function addAtomicActivity(form: AtomicActivityForm): Promise<string> {
    const suffix = Date.now().toString(36)
    const slug = form.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'activity'
    const base = 'https://example.org/vpd#'
    const uri = `${base}activity-${slug}-${suffix}`
    const now = new Date().toISOString()

    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }

    const lines: string[] = []
    lines.push(`  <${uri}> a wild:AtomicActivity, sosa:Procedure .`)
    lines.push(`  <${uri}> dcterms:title "${esc(form.title)}"@en .`)
    if (form.description.trim()) {
      lines.push(`  <${uri}> dcterms:description "${esc(form.description)}"@en .`)
    }
    lines.push(`  <${uri}> dcterms:issued "${now}"^^xsd:dateTime .`)
    if (form.systemUri) lines.push(`  <${uri}> ssn:implementedBy <${form.systemUri}> .`)
    if (form.inputUri) lines.push(`  <${uri}> ssn:hasInput <${form.inputUri}> .`)

    const update = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX sosa:    <http://www.w3.org/ns/sosa/>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX xsd:     <http://www.w3.org/2001/XMLSchema#>

      INSERT DATA {
${lines.join('\n')}
      }
    `
    await updateSparql(graphStore.updateEndpoint, update)
    return uri
  }

  async function updateAtomicActivity(uri: string, form: AtomicActivityForm): Promise<void> {
    function esc(s: string): string {
      return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    }
    const descInsert = form.description.trim()
      ? `<${uri}> dcterms:description "${esc(form.description)}"@en .`
      : ''
    const sysInsert = form.systemUri ? `<${uri}> ssn:implementedBy <${form.systemUri}> .` : ''
    const inpInsert = form.inputUri ? `<${uri}> ssn:hasInput <${form.inputUri}> .` : ''

    const update = `
      PREFIX dcterms: <http://purl.org/dc/terms/>
      PREFIX ssn:     <http://www.w3.org/ns/ssn/>

      DELETE {
        <${uri}> dcterms:title ?t .
        <${uri}> dcterms:description ?d .
        <${uri}> ssn:implementedBy ?sys .
        <${uri}> ssn:hasInput ?inp .
      }
      INSERT {
        <${uri}> dcterms:title "${esc(form.title)}"@en .
        ${descInsert}
        ${sysInsert}
        ${inpInsert}
      }
      WHERE {
        OPTIONAL { <${uri}> dcterms:title ?t }
        OPTIONAL { <${uri}> dcterms:description ?d }
        OPTIONAL { <${uri}> ssn:implementedBy ?sys }
        OPTIONAL { <${uri}> ssn:hasInput ?inp }
      }
    `
    await updateSparql(graphStore.updateEndpoint, update)
  }

  async function isAtomicActivityInUse(uri: string): Promise<boolean> {
    const query = `
      PREFIX wild: <http://purl.org/wild/vocab#>
      PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      ASK {
        ?wf a wild:WorkflowModel .
        ?wf wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)+ <${uri}> .
      }
    `
    return askSparql(graphStore.endpoint, query)
  }

  async function deleteAtomicActivity(uri: string): Promise<void> {
    const update = `
      DELETE { <${uri}> ?p ?o }
      WHERE  { <${uri}> ?p ?o }
    `
    await updateSparql(graphStore.updateEndpoint, update)
  }

  // ── Delete workflow model (only allowed when no runs exist) ─────────────

  async function deleteWorkflowModel(uri: string): Promise<void> {
    const update = `
      PREFIX wild:    <http://purl.org/wild/vocab#>
      PREFIX rdf:     <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX dcterms: <http://purl.org/dc/terms/>

      DELETE { <${uri}> ?p ?o }
      WHERE  { <${uri}> ?p ?o } ;

      DELETE { ?root ?p ?o }
      WHERE  { <${uri}> wild:hasBehaviour ?root . ?root ?p ?o } ;

      DELETE { ?desc ?p ?o }
      WHERE  {
        <${uri}> wild:hasBehaviour ?root .
        ?root (wild:hasChildActivities/rdf:rest*/rdf:first)+ ?desc .
        ?desc ?p ?o
        FILTER NOT EXISTS { ?desc dcterms:issued ?_ }
      } ;

      DELETE { ?node rdf:first ?f . ?node rdf:rest ?r }
      WHERE  {
        <${uri}> wild:hasBehaviour/(wild:hasChildActivities/rdf:rest*/rdf:first)* ?comp .
        ?comp wild:hasChildActivities/rdf:rest* ?node .
        ?node rdf:first ?f .
        ?node rdf:rest ?r
      }
    `
    await updateSparql(graphStore.updateEndpoint, update)
  }

  return {
    fetchWorkflows,
    fetchWorkflow,
    fetchWorkflowInstances,
    fetchRun,
    updateWorkflowInstance,
    fetchWorkflowForEdit,
    addWorkflowModel,
    updateWorkflowModel,
    updateWorkflowModelMetadata,
    deleteWorkflowModel,
    addWorkflowRun,
    fetchWorkflowStepOptions,
    fetchSystemOptions,
    fetchInputOptions,
    fetchAtomicActivities,
    fetchAtomicActivityOptions,
    addAtomicActivity,
    updateAtomicActivity,
    isAtomicActivityInUse,
    deleteAtomicActivity,
  }
})

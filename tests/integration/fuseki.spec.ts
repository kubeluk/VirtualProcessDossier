import { newLaminate, readLaminate } from '../../src/domain/laminate'
import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BASE,
  NS,
  Store,
  merge,
  serialize,
  typed,
  value,
  objects,
  object,
  list,
  n,
  df,
} from '../../src/domain/rdf'
import { KnowledgeRepository } from '../../src/services/repository'
import {
  copySettings,
  buildInitialization,
  initializationIris,
  planStages,
} from '../../src/domain/initialization'
import { seed } from '../../scripts/seed'
import { canonical, expectedInitialization, initializationSource, sourceRun } from '../helpers'
import { runActivities, runLaminate, datasetsFor, runPlans } from '../../src/domain/model'
import type { InitializationDraft } from '../../src/domain/types'
const url = process.env.FUSEKI_URL ?? 'http://localhost:3330'
const dataset = 'vpd_it_' + Date.now()
const headers = {
  Authorization:
    'Basic ' + Buffer.from('admin:' + (process.env.ADMIN_PASSWORD ?? 'admin')).toString('base64'),
}
const authorizedFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers)), ...headers },
  })
const repo = new KnowledgeRepository(
  url + '/' + dataset + '/sparql',
  url + '/' + dataset + '/update',
  authorizedFetch,
)
let refs: Store
beforeAll(async () => {
  await seed({ url, dataset, password: process.env.ADMIN_PASSWORD })
  refs = await repo.getReferenceGraph()
})
afterAll(async () => {
  await fetch(url + '/$/datasets/' + dataset, { method: 'DELETE', headers })
})
const all = () => repo.construct('CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }')
async function useFreshLaminate(draft: InitializationDraft) {
  const laminate = BASE + 'laminate/' + draft.id + '#it'
  const material = new Store(
    refs
      .getQuads(n(BASE + 'laminate/1#it'), null, null, null)
      .map((quad) => df.quad(n(laminate), quad.predicate, quad.object, quad.graph)),
  )
  await repo.update('INSERT DATA { ' + serialize(material) + ' }')
  refs = merge(refs, material)
  draft.laminate = laminate
}
describe('real Fuseki reads', () => {
  it('seeds two distinct run states and skips repeated startup without duplicating blank nodes', async () => {
    const before = await canonical(await all())
    expect(await seed({ url, dataset })).toMatchObject({ seeded: false })
    expect(await canonical(await all())).toBe(before)
    const runs = await repo.listRuns()
    expect(runs.total).toBe(2)
    expect(runs.items.map((r) => r.state).sort()).toEqual(
      [NS.wild + 'done', NS.wild + 'initialized'].sort(),
    )
    expect(runs.items.find((r) => r.uri === sourceRun)?.datasetCount).toBe(3)
    expect((await repo.stats()).datasets).toBe(5)
  })
  it('filters, counts, and paginates on the server without requiring complete provenance', async () => {
    expect((await repo.listRuns({ state: NS.wild + 'done' })).total).toBe(1)
    expect((await repo.listRuns({ laminate: BASE + 'laminate/1#it' })).total).toBe(1)
    expect((await repo.listRuns({ laminate: BASE + 'laminate/demo-initialized#it' })).total).toBe(1)
    expect((await repo.listRuns({ from: '2026-09-24', to: '2026-09-24' })).total).toBe(1)
    expect((await repo.listRuns({}, 1)).items).toHaveLength(1)
    expect((await repo.listRuns({ page: 1 }, 1)).items[0]?.uri).not.toBe(
      (await repo.listRuns({}, 1)).items[0]?.uri,
    )
    expect((await repo.listDatasets()).total).toBe(5)
    expect((await repo.listDatasets({ run: sourceRun })).total).toBe(3)
    expect((await repo.listDatasets({ sensor: BASE + 'sensor/pyrometer/1#it' })).total).toBe(1)
    expect((await repo.listDatasets({ property: BASE + 'property#force' })).total).toBe(1)
    expect((await repo.listDatasets({ feature: BASE + 'laminate/1#it' })).total).toBe(2)
    expect((await repo.listDatasets({ model: BASE + 'workflow#stampForming' })).total).toBe(3)
    expect((await repo.listDatasets({ media: 'model/stl' })).total).toBe(2)
    expect(
      (await repo.listDatasets({ search: 'context is not supplied " \\ ?s ?p ?o' })).total,
    ).toBe(0)
  })
  it('reads observation-mediated context and distinguishes direct laminate and equipment observations', async () => {
    const graph = merge(refs, await repo.getRunContext(sourceRun))
    expect(runActivities(graph, sourceRun)).toHaveLength(43)
    expect(
      runActivities(graph, sourceRun).filter((t) =>
        typed(graph, NS.sosa + 'Observation').some((o) => o.equals(t)),
      ),
    ).toHaveLength(29)
    expect(runLaminate(graph, sourceRun)).toBe(BASE + 'laminate/1#it')
    const temperature = BASE + 'workflow/instance/1#observeLaminateSurfaceTemperature1'
    expect(datasetsFor(graph, temperature).map((t) => t.value)).toEqual([
      BASE + 'demo/dataset#temperature',
    ])
    expect(value(graph, temperature, NS.sosa + 'madeBySensor')).toBe(BASE + 'sensor/pyrometer/1#it')
    expect(
      value(
        graph,
        BASE + 'workflow/instance/1#observeGripperForce1',
        NS.sosa + 'hasFeatureOfInterest',
      ),
    ).toBe(BASE + 'system/gripper/1#it')
    const standalone = await repo.getDatasetContext(BASE + 'dataset#ex1')
    expect(value(standalone, BASE + 'observation#ex1', NS.wild + 'inWorkflowInstance')).toBe('')
    expect(objects(standalone, BASE + 'dataset#ex1', NS.dcat + 'distribution')).toHaveLength(1)
  })
  it('loads linked quantity metadata and named coordinate lists without the reference cache', async () => {
    await repo.update(`INSERT DATA {
      <urn:test:metadata> geo:hasSize <urn:test:dimension>, [ qudt:value 400.0 ; qudt:hasUnit unit:MilliM ] ;
        qudt:quantityValue <urn:test:position> ; rdfs:seeAlso <urn:test:linked-record> .
      <urn:test:dimension> qudt:value "4.00e2"^^xsd:double ; qudt:hasUnit unit:MilliM .
      <urn:test:position> qudt:value <urn:test:coordinate-x> ; qudt:hasUnit unit:MilliM .
      <urn:test:coordinate-x> rdf:first 190.0 ; rdf:rest <urn:test:coordinate-y> .
      <urn:test:coordinate-y> rdf:first -100.0 ; rdf:rest rdf:nil .
      <urn:test:linked-record> rdfs:label "Separate linked record" .
    }`)
    const graph = await repo.getEntityMetadata('urn:test:metadata')
    const sizes = objects(graph, 'urn:test:metadata', NS.geo + 'hasSize')
    expect(sizes).toHaveLength(2)
    for (const size of sizes) {
      expect(Number(value(graph, size, NS.qudt + 'value'))).toBe(400)
      expect(value(graph, size, NS.qudt + 'hasUnit')).toBe(NS.unit + 'MilliM')
    }
    const coordinates = list(graph, object(graph, 'urn:test:position', NS.qudt + 'value'))
    expect(coordinates.map((term) => Number(term.value))).toEqual([190, -100])
    expect(graph.getQuads(n('urn:test:linked-record'), null, null, null)).toHaveLength(0)
    const position = await repo.getEntityMetadata('urn:test:position')
    expect(
      list(position, object(position, 'urn:test:position', NS.qudt + 'value')).map((term) =>
        Number(term.value),
      ),
    ).toEqual([190, -100])
  })
  it('executes the supplied read-query contracts and preserves list, unit, and reference information', async () => {
    const readQuery = async (name: string) =>
      readFile(new URL('../../data/queries/reads/' + name, import.meta.url), 'utf8')
    expect(await repo.select(await readQuery('get-activity-instances.rq'))).toHaveLength(43)
    expect(await repo.select(await readQuery('get-observation-bindings.rq'))).toHaveLength(29)
    expect(await repo.select(await readQuery('get-workflow-instance.rq'))).toHaveLength(1)
    const graph = await repo.construct(
      await readFile(
        new URL('../../data/queries/reads/get-initialization-plans.rq', import.meta.url),
        'utf8',
      ),
    )
    const plan = BASE + 'plan/1#pressing'
    const steps = list(graph, object(graph, plan, NS.press + 'closingSteps'))
    expect(
      steps.map((s) =>
        value(graph, object(graph, s, NS.press + 'closingSpeed'), NS.qudt + 'value'),
      ),
    ).toEqual(['80.0', '60.0', '35.0', '10.0'])
    const position = object(
      graph,
      objects(graph, BASE + 'plan/1#gripping', NS.frame + 'gripperPosition')[0],
      NS.frame + 'position',
    )
    expect(value(graph, position, NS.prov + 'wasDerivedFrom')).toBe(
      BASE + 'system/frame#referencePoint',
    )
  })
})
describe('real Fuseki writes', () => {
  it('requires update authentication at the server proxy boundary', async () => {
    const draft = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-ui-protocol',
    )
    draft.name = 'UI dataset protocol'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const publicRepository = new KnowledgeRepository(repo.queryEndpoint, repo.updateEndpoint)
    await expect(publicRepository.initializeRun(draft, refs)).rejects.toThrow('(401)')
    await expect(repo.initializeRun(draft, refs)).resolves.toBe(initializationIris(draft).run)
  })
  it('leaves an empty graph after a failed seed upload and can retry cleanly', async () => {
    const failedDataset = dataset + '_upload'
    try {
      const rejectUpload: typeof fetch = (input, init) =>
        String(input).includes('/data?default')
          ? Promise.resolve(new Response('Simulated upload failure', { status: 503 }))
          : fetch(input, init)
      await expect(seed({ url, dataset: failedDataset, fetcher: rejectUpload })).rejects.toThrow(
        'Seed upload failed',
      )
      const isolated = new KnowledgeRepository(
        url + '/' + failedDataset + '/sparql',
        url + '/' + failedDataset + '/update',
        authorizedFetch,
      )
      expect(await isolated.ask('ASK { ?s ?p ?o }')).toBe(false)
      await expect(seed({ url, dataset: failedDataset })).resolves.toMatchObject({ seeded: true })
      expect((await isolated.listRuns()).total).toBe(2)
    } finally {
      await fetch(url + '/$/datasets/' + failedDataset, { method: 'DELETE', headers })
    }
  })
  it('writes precisely the supplied initialization contract and leaves the existing graph unchanged', async () => {
    const source = await initializationSource()
    const draft = copySettings(merge(refs, source), sourceRun, refs, 'integration-create')
    draft.name = 'Integration "quoted"\nrun'
    draft.notes = 'Backslash \\ Unicode ä'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const before = await all(),
      generated = buildInitialization(draft, refs),
      expected = expectedInitialization(source, generated, draft)
    const uri = await repo.initializeRun(draft, refs)
    expect(uri).toBe(initializationIris(draft).run)
    expect(await canonical(await all())).toBe(await canonical(merge(before, expected)))
    const rows = await repo.select(
      `SELECT ?plan WHERE { <${uri}> for:workflowInitialization/for:parameterization/prov:hadMember ?plan . ?plan a prov:Plan }`,
    )
    expect(rows).toHaveLength(3)
    expect(runActivities(await repo.getRunContext(uri), uri)).toHaveLength(5)
    expect(
      await repo.ask(
        `ASK { ?instance wild:inWorkflowInstance <${uri}> ; for:initialization ?plan }`,
      ),
    ).toBe(false)
    expect(await repo.ask(`ASK { <${uri}> prov:startedAtTime ?time }`)).toBe(false)
  })
  it('executes the reference initialization query with complete collection-owned plans', async () => {
    const draft = copySettings(
      merge(refs, await initializationSource()),
      sourceRun,
      refs,
      'reference-query',
    )
    draft.name = 'Reference query test'
    draft.notes = 'Example Run Comment'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const query = (
      await readFile(
        new URL('../../data/queries/updates/initialize-stamp-forming-run.ttl', import.meta.url),
        'utf8',
      )
    )
      .replace('INSERT_CORRECT_UUID_HERE', draft.id)
      .replace('Example Run Label', draft.name)
    await repo.update(query)
    const rows = await repo.select(
      'SELECT ?run WHERE { ?run a wild:WorkflowInstance ; rdfs:label "Reference query test" }',
    )
    expect(rows).toHaveLength(1)
    const run = rows[0]!.run!.value
    const context = await repo.getRunContext(run)
    const actual = new Store()
    const pending = [n(run), ...runActivities(context, run), ...runPlans(context, run)]
    const visited = new Set<string>()
    while (pending.length) {
      const subject = pending.pop()!
      if (visited.has(subject.value)) continue
      visited.add(subject.value)
      for (const q of context.getQuads(subject, null, null, null)) {
        actual.addQuad(q)
        if (q.object.termType === 'BlankNode') pending.push(q.object)
      }
    }
    const expected = buildInitialization(draft, refs),
      ids = initializationIris(draft)
    const substitutions = new Map([[run, ids.run]])
    for (const instance of runActivities(actual, run)) {
      const model = value(actual, instance, NS.wild + 'activityInstanceOf')
      const target = runActivities(expected, ids.run).find(
        (item) => value(expected, item, NS.wild + 'activityInstanceOf') === model,
      )
      expect(target).toBeDefined()
      substitutions.set(instance.value, target!.value)
    }
    for (const plan of runPlans(actual, run)) {
      const stages = planStages(actual, plan)
      expect(stages).toHaveLength(1)
      substitutions.set(plan.value, ids.plan(stages[0]!))
    }
    const remap = (term: Parameters<typeof df.quad>[2]) =>
      substitutions.has(term.value) ? n(substitutions.get(term.value)!) : term
    const mapped = new Store(
      [...actual].map((q) =>
        df.quad(
          remap(q.subject) as typeof q.subject,
          q.predicate,
          remap(q.object) as typeof q.object,
        ),
      ),
    )
    expect(await canonical(mapped)).toBe(await canonical(expected))
    const planRead = (
      await readFile(
        new URL('../../data/queries/reads/get-initialization-plans.rq', import.meta.url),
        'utf8',
      )
    ).replace('<workflow/instance/1#it>', '<' + run + '>')
    const plans = await repo.construct(planRead)
    expect(runPlans(plans, run)).toHaveLength(3)
    expect(copySettings(merge(refs, plans, actual), run, refs).press.steps).toEqual(
      draft.press.steps,
    )
  })
  it('rejects invalid input without sending an update or changing any triples', async () => {
    const before = await canonical(await all()),
      graph = merge(refs, await repo.getRunContext(sourceRun))
    const draft = copySettings(graph, sourceRun, refs, 'integration-invalid')
    draft.name = 'Invalid'
    draft.laminateConfirmed = true
    draft.grippers[0]!.heating = '1.5'
    await expect(repo.initializeRun(draft, refs)).rejects.toThrow('integer')
    expect(await canonical(await all())).toBe(before)
  })
  it('recovers from a lost save response without duplicates and reports changed retry settings', async () => {
    const draft = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-retry',
    )
    draft.name = 'Retry test'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    let failed = false
    const loseResponse: typeof fetch = async (input, init) => {
      const response = await authorizedFetch(input, init)
      if (String(input).endsWith('/update') && !failed) {
        failed = true
        throw new Error('Simulated lost response after commit')
      }
      return response
    }
    const retry = new KnowledgeRepository(repo.queryEndpoint, repo.updateEndpoint, loseResponse)
    await expect(retry.initializeRun(draft, refs)).rejects.toThrow('lost response')
    const afterCommit = await canonical(await all())
    await expect(repo.initializeRun(draft, refs)).resolves.toBe(initializationIris(draft).run)
    expect(await canonical(await all())).toBe(afterCommit)
    draft.press.force = '950.0'
    await expect(repo.initializeRun(draft, refs)).rejects.toThrow('different settings')
    expect(await canonical(await all())).toBe(afterCommit)
  })
  it('serializes concurrent submissions of the same initialization without duplicate plans', async () => {
    const draft = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-concurrent',
    )
    draft.name = 'Concurrent retry'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const before = await all(),
      graph = buildInitialization(draft, refs)
    const result = await Promise.all([
      repo.initializeRun(draft, refs),
      repo.initializeRun(draft, refs),
    ])
    expect(result[0]).toBe(result[1])
    expect(await canonical(await all())).toBe(await canonical(merge(before, graph)))
  })
  it.each(['initialized', 'done'])(
    'rejects reuse of a laminate from an %s run without writing triples',
    async (state) => {
      const draft = copySettings(
        merge(refs, await repo.getRunContext(sourceRun)),
        sourceRun,
        refs,
        'integration-used-' + state,
      )
      draft.name = 'Laminate reuse test'
      draft.laminateConfirmed = true
      await useFreshLaminate(draft)
      const existing = BASE + 'workflow/instance/used-' + state + '#it'
      await repo.update(`INSERT DATA {
      <${existing}> a wild:WorkflowInstance ; wild:hasState wild:${state} ;
        for:workflowInitialization [ for:laminate <${draft.laminate}> ] .
    }`)
      expect(await repo.usedLaminates()).toContain(draft.laminate)
      expect(await repo.usedLaminates(existing)).not.toContain(draft.laminate)
      const before = await canonical(await all())
      await expect(repo.initializeRun(draft, refs)).rejects.toThrow('Choose an unused laminate')
      expect(await canonical(await all())).toBe(before)
    },
  )
  it('allows only one of two different workflows to claim the same unused laminate', async () => {
    const first = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-competing-first',
    )
    first.name = 'First workflow'
    first.laminateConfirmed = true
    await useFreshLaminate(first)
    const second = { ...first, id: 'integration-competing-second', name: 'Second workflow' }
    const before = await all()
    const results = await Promise.allSettled([
      repo.initializeRun(first, refs),
      repo.initializeRun(second, refs),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')!
    expect(rejected.reason.message).toContain('Choose an unused laminate')
    const winner = results[0]!.status === 'fulfilled' ? first : second
    expect(await canonical(await all())).toBe(
      await canonical(merge(before, buildInitialization(winner, refs))),
    )
  })
  it('accepts demonstrator completion and dataset templates while using shop-floor-created atomic identities', async () => {
    const draft = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-execution',
    )
    draft.name = 'Execution interoperability'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const run = await repo.initializeRun(draft, refs)
    // The shop-floor system owns atomic identities and links plans when creating instances.
    const heating = n(BASE + 'activity/instance/shop-floor-heating#it')
    const obs = n(BASE + 'activity/instance/shop-floor-observation#it')
    const plan = initializationIris(draft).plan('heating')
    await repo.update(`INSERT DATA {
      <${heating.value}> a wild:ActivityInstance ; wild:activityInstanceOf activity:heating ;
        wild:inWorkflowInstance <${run}> ; wild:hasState wild:initialized ; for:initialization <${plan}> .
      <${plan}> for:initialized <${heating.value}> .
      <${obs.value}> a wild:ActivityInstance ; wild:activityInstanceOf activity:observeGripperAngle1 ;
        wild:inWorkflowInstance <${run}> ; wild:hasState wild:initialized .
    }`)
    let query = await readFile(
      new URL(
        '../../data/queries/updates/machine-activities/demonstrator/insert-heating.rq',
        import.meta.url,
      ),
      'utf8',
    )
    query = query
      .replace('<activity/instance/000-heating#it>', '<' + heating.value + '>')
      .replaceAll('<workflow/instance/000#it>', '<' + run + '>')
    await repo.update(query)
    const completed = await repo.getRunContext(run)
    expect(value(completed, heating, NS.wild + 'hasState')).toBe(NS.wild + 'done')
    expect(objects(completed, heating, NS.wild + 'hasState')).toHaveLength(1)
    expect(value(completed, heating, NS.for + 'initialization')).toBe(
      initializationIris(draft).plan('heating'),
    )
    const association = object(completed, heating, NS.prov + 'qualifiedAssociation')
    expect(value(completed, association, NS.prov + 'hadPlan')).toBe(
      initializationIris(draft).plan('heating'),
    )
    let sensorQuery = await readFile(
      new URL(
        '../../data/queries/updates/sensor-activities/demonstrator/template-insert-observation.rq',
        import.meta.url,
      ),
      'utf8',
    )
    sensorQuery = sensorQuery
      .replace('<activity/instance/000-observe-gripper-angle-1#it>', '<' + obs.value + '>')
      .replace('<activity#XYZ>', '<' + NS.activity + 'observeGripperAngle1>')
      .replace('<workflow/instance/000#it>', '<' + run + '>')
      .replace('<http://purl.org/for/sensor/XYZ/1#it>', '<' + BASE + 'sensor/angle/1#it>')
      .replace(
        '<http://purl.org/for/system-or-laminate/XYZ/000#it>',
        '<' + BASE + 'system/gripper/1#it>',
      )
      .replace('<http://purl.org/for/property#XYZ>', '<' + BASE + 'property#angle>')
    await repo.update(sensorQuery)
    let datasetQuery = await readFile(
      new URL(
        '../../data/queries/updates/sensor-activities/demonstrator/template-insert-dataset.rq',
        import.meta.url,
      ),
      'utf8',
    )
    datasetQuery = datasetQuery
      .replace('<vpd/dataset/000#it>', '<' + BASE + 'demo/dataset#integration>')
      .replace(
        '<activity/instance/000-observe-laminate-surface-temperature-1#it>',
        '<' + obs.value + '>',
      )
    await repo.update(datasetQuery)
    expect((await repo.listDatasets({ run })).total).toBe(1)
    expect((await repo.listDatasets({ sensor: BASE + 'sensor/angle/1#it' })).total).toBe(1)
    const recorded = await repo.getRunContext(run)
    expect(value(recorded, obs, NS.sosa + 'observedProperty')).toBe(BASE + 'property#angle')
    expect(datasetsFor(recorded, obs).map((t) => t.value)).toContain(
      BASE + 'demo/dataset#integration',
    )
    expect(value(recorded, run, NS.wild + 'hasState')).toBe(NS.wild + 'initialized')
  })
  it('does not double-count a dataset with multiple distributions', async () => {
    const node = df.blankNode(),
      graph = new Store()
    graph.addQuad(n(BASE + 'demo/dataset#geometry'), n(NS.dcat + 'distribution'), node)
    graph.addQuad(node, n(NS.rdf + 'type'), n(NS.dcat + 'Distribution'))
    graph.addQuad(node, n(NS.dcat + 'mediaType'), df.literal('application/octet-stream'))
    await repo.update('INSERT DATA { ' + serialize(graph) + ' }')
    expect((await repo.listDatasets({ run: sourceRun })).total).toBe(3)
    expect((await repo.listRuns({ state: NS.wild + 'done' })).items[0]?.datasetCount).toBe(3)
    expect(
      objects(
        await repo.getDatasetContext(BASE + 'demo/dataset#geometry'),
        BASE + 'demo/dataset#geometry',
        NS.dcat + 'distribution',
      ),
    ).toHaveLength(2)
  })
})

describe('laminate CRUD', () => {
  it('creates, updates and deletes the complete unshared graph', async () => {
    const d = readLaminate(refs, BASE + 'laminate/1#it')
    d.uri = newLaminate().uri
    d.identifier = 'crud-test'
    await repo.saveLaminate(d, refs)
    const created = await repo.getReferenceGraph()
    expect(readLaminate(created, d.uri).identifier).toBe('crud-test')
    const oldLayup = value(created, d.uri, NS.prov + 'wasDerivedFrom')
    // Unmanaged metadata is retained by edits.
    await repo.update(`INSERT DATA { <${d.uri}> rdfs:comment "Keep me" }`)
    d.name = 'Changed laminate'
    d.layers.splice(1)
    d.needles = []
    await repo.saveLaminate(d, created, true)
    const updated = await repo.getReferenceGraph()
    expect(readLaminate(updated, d.uri)).toMatchObject({
      name: d.name,
      layers: [expect.objectContaining({ polymer: 'PA6', fiber: 'GF' })],
      needles: [],
    })
    const savedLayer = readLaminate(updated, d.uri).layers[0]!
    expect(Number(savedLayer.angle)).toBe(0)
    expect(Number(savedLayer.fraction)).toBe(60)
    expect(value(updated, d.uri, NS.rdfs + 'comment')).toBe('Keep me')
    expect(await repo.ask(`ASK { <${oldLayup}> ?p ?o }`)).toBe(false)
    await repo.deleteLaminate(d.uri)
    expect(await repo.ask(`ASK { <${d.uri}> ?p ?o }`)).toBe(false)
    expect(
      await repo.ask(`ASK { ?s ?p ?o FILTER(STRSTARTS(STR(?s), "${d.uri.split('#')[0]}")) }`),
    ).toBe(false)
    expect(await repo.ask(`ASK { <${BASE}laminate#origin> a for:ReferencePoint }`)).toBe(true)
  })
  it('preserves a shared layup and blocks deletion of referenced laminates', async () => {
    const d = readLaminate(refs, BASE + 'laminate/1#it')
    d.uri = newLaminate().uri
    await repo.saveLaminate(d, refs)
    const graph = await repo.getReferenceGraph()
    const layup = value(graph, d.uri, NS.prov + 'wasDerivedFrom')
    await repo.update(
      `INSERT DATA { <urn:test:shared-owner> prov:wasDerivedFrom <${layup}> . <urn:test:run> for:laminate <${d.uri}> }`,
    )
    await expect(repo.deleteLaminate(d.uri)).rejects.toThrow('referenced')
    await repo.update(`DELETE DATA { <urn:test:run> for:laminate <${d.uri}> }`)
    await repo.deleteLaminate(d.uri)
    expect(
      await repo.ask(
        `ASK { <${layup}> param:tapeStack/rdf:rest*/rdf:first/param:hasFiberMassFraction/qudt:value ?v }`,
      ),
    ).toBe(true)
  })
})

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
} from '../../src/domain/initialization'
import { buildSeedGraph, seed } from '../../scripts/seed'
import { canonical, expectedInitialization, initializationSource, sourceRun } from '../helpers'
import {
  runActivities,
  runLaminate,
  datasetsFor,
  runPlans,
  executionPlans,
} from '../../src/domain/model'
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
async function expectInsertedGraph(before: Store, expected: Store, run: string, started: number) {
  const actual = await all()
  const generated = actual.getQuads(n(run), n(NS.prov + 'generatedAtTime'), null, null)
  expect(generated).toHaveLength(1)
  const timestamp = generated[0]!.object
  expect(timestamp.termType).toBe('Literal')
  if (timestamp.termType !== 'Literal') throw new Error('Expected a generation timestamp')
  expect(timestamp.datatype.value).toBe(NS.xsd + 'dateTime')
  expect(Date.parse(timestamp.value)).toBeGreaterThanOrEqual(started)
  expect(Date.parse(timestamp.value)).toBeLessThanOrEqual(Date.now())
  // Generation time is chosen during the real write; compare every other fixture triple exactly.
  expected.removeQuads(expected.getQuads(n(run), n(NS.prov + 'generatedAtTime'), null, null))
  expected.addQuads(generated)
  expect(await canonical(actual)).toBe(await canonical(merge(before, expected)))
}
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
  it('seeds only the selected data files and preserves them on repeated startup', async () => {
    const before = await canonical(await all())
    expect(before).toBe(await canonical(await buildSeedGraph()))
    expect(await seed({ url, dataset })).toMatchObject({ seeded: false })
    expect(await canonical(await all())).toBe(before)
    const runs = await repo.listRuns()
    expect(runs.total).toBe(1)
    expect(runs.items.map((r) => r.state)).toEqual([NS.wild + 'done'])
    expect(runs.items.find((r) => r.uri === sourceRun)?.datasetCount).toBe(4)
    expect((await repo.stats()).datasets).toBe(4)
  })
  it('filters, counts, and paginates on the server without requiring complete provenance', async () => {
    expect((await repo.listRuns({ state: NS.wild + 'done' })).total).toBe(1)
    expect((await repo.listRuns({ laminate: BASE + 'laminate/1#it' })).total).toBe(1)
    expect((await repo.listRuns({ state: NS.wild + 'initialized' })).total).toBe(0)
    expect((await repo.listRuns({ from: '2026-09-24', to: '2026-09-24' })).total).toBe(1)
    expect((await repo.listRuns({}, 1)).items).toHaveLength(1)
    expect((await repo.listRuns({ page: 1 }, 1)).items).toHaveLength(0)
    expect((await repo.listDatasets({ page: 1 }, 1)).items[0]?.uri).not.toBe(
      (await repo.listDatasets({}, 1)).items[0]?.uri,
    )
    expect((await repo.listDatasets()).total).toBe(4)
    expect((await repo.listDatasets({ run: sourceRun })).total).toBe(4)
    expect((await repo.listDatasets({ sensor: BASE + 'sensor/pyrometer/1#it' })).total).toBe(1)
    expect((await repo.listDatasets({ property: BASE + 'property#force' })).total).toBe(2)
    expect((await repo.listDatasets({ feature: BASE + 'laminate/1#it' })).total).toBe(2)
    expect((await repo.listDatasets({ model: BASE + 'workflow#stampForming' })).total).toBe(4)
    expect((await repo.listDatasets({ media: 'model/stl' })).total).toBe(1)
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
      BASE + 'dataset#3',
    ])
    expect(value(graph, temperature, NS.sosa + 'madeBySensor')).toBe(BASE + 'sensor/pyrometer/1#it')
    expect(
      value(
        graph,
        BASE + 'workflow/instance/1#observeGripperForce1',
        NS.sosa + 'hasFeatureOfInterest',
      ),
    ).toBe(BASE + 'system/gripper/1#it')
  })
  it('loads each catalog distribution once together with its recorded production context', async () => {
    for (const id of [1, 2, 3, 4]) {
      const uri = BASE + 'dataset#' + id
      const graph = merge(refs, await repo.getDatasetContext(uri))
      expect(objects(graph, uri, NS.dcat + 'distribution')).toHaveLength(1)
      const observation = object(graph, uri, NS.prov + 'wasGeneratedBy')!
      expect(value(graph, observation, NS.wild + 'inWorkflowInstance')).toBe(sourceRun)
      expect(value(graph, sourceRun, NS.rdfs + 'label')).toBe('Trial No. 1')
      expect(value(graph, sourceRun, NS.wild + 'workflowInstanceOf')).toBe(
        BASE + 'workflow#stampForming',
      )
      expect(runLaminate(graph, sourceRun)).toBe(BASE + 'laminate/1#it')
    }
  })
  it('preserves missing execution context for a standalone dataset', async () => {
    await repo.update(`INSERT DATA {
      <urn:test:standalone-dataset> a dcat:Dataset ;
        prov:wasGeneratedBy <urn:test:standalone-observation> ;
        dcat:distribution [ a dcat:Distribution ; dcat:mediaType "text/plain" ] .
      <urn:test:standalone-observation> a sosa:Observation .
    }`)
    const standalone = await repo.getDatasetContext('urn:test:standalone-dataset')
    expect(value(standalone, 'urn:test:standalone-observation', NS.wild + 'inWorkflowInstance')).toBe('')
    expect(objects(standalone, 'urn:test:standalone-dataset', NS.dcat + 'distribution')).toHaveLength(1)
    expect(typed(standalone, NS.wild + 'WorkflowInstance')).toHaveLength(0)
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
  it('executes every current read template, including ordered steps and generation time', async () => {
    const readQuery = async (name: string) =>
      (await readFile(new URL('../../data/queries/reads/' + name, import.meta.url), 'utf8'))
        .replace('PUT_WORKFLOW_INSTANCE_UUID_HERE', '1')
        .replace('WORKFLOW_INSTANCE_UUID', '1')
    expect(await repo.select(await readQuery('get-laminate.rq'))).toHaveLength(1)
    expect(await repo.select(await readQuery('get-global-heating-parameters.rq'))).toHaveLength(1)
    expect(await repo.select(await readQuery('get-global-pressing-parameters.rq'))).toHaveLength(1)
    expect(await repo.select(await readQuery('get-gripper-positions.rq'))).toHaveLength(8)
    expect(await repo.select(await readQuery('get-gripper-setpoints.rq'))).toHaveLength(24)
    expect(await repo.select(await readQuery('get-mold-temperatures.rq'))).toHaveLength(2)
    expect(await repo.select(await readQuery('get-oven-field-temperatures.rq'))).toHaveLength(8)
    const steps = await repo.select(await readQuery('get-pressing-steps.rq'))
    expect(steps.map((step) => step.speed!.value)).toEqual(['80.0', '60.0', '35.0', '10.0'])
    const scheduled = await repo.select(await readQuery('get-workflow-instances.rq'))
    expect(scheduled).toEqual([])
  })
  it.each(['blank', 'named'])(
    'loads %s execution plans and their association equipment',
    async (kind) => {
      const activity = 'urn:test:execution-' + kind
      const association = kind === 'named' ? '<urn:test:association>' : '_:association'
      const plan = kind === 'named' ? '<urn:test:used-plan>' : '_:used'
      await repo.update(`INSERT DATA {
      <${activity}> a wild:ActivityInstance ; wild:inWorkflowInstance <${sourceRun}> ;
        wild:activityInstanceOf activity:heating ; prov:qualifiedAssociation ${association} .
      ${association} a prov:Association ; prov:agent <${BASE}system/oven/1#it> ; prov:hadPlan ${plan} .
      ${plan} a prov:Plan ; oven:thresholdTemperature [ qudt:value 275.0 ; qudt:hasUnit unit:DEG_C ] .
    }`)
      const graph = await repo.getRunContext(sourceRun)
      const records = executionPlans(graph, activity)
      expect(records).toHaveLength(1)
      expect(records[0]!.plan.termType).toBe(kind === 'named' ? 'NamedNode' : 'BlankNode')
      expect(records[0]!.equipment.map((t) => t.value)).toEqual([BASE + 'system/oven/1#it'])
      expect(
        value(
          graph,
          object(graph, records[0]!.plan, NS.oven + 'thresholdTemperature'),
          NS.qudt + 'value',
        ),
      ).toBe('275.0')
      expect(runPlans(graph, sourceRun)).toHaveLength(3)
      expect(copySettings(merge(refs, graph), sourceRun, refs).oven.threshold).toBe('260.0')
    },
  )
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
      expect((await isolated.listRuns()).total).toBe(1)
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
    const started = Date.now()
    const uri = await repo.initializeRun(draft, refs)
    expect(uri).toBe(initializationIris(draft).run)
    await expectInsertedGraph(before, expected, uri, started)
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
    const scheduled = await repo.select(
      await readFile(
        new URL('../../data/queries/reads/get-workflow-instances.rq', import.meta.url),
        'utf8',
      ),
    )
    expect(scheduled.map((row) => row.workflow_instance!.value)).toContain(uri)
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
    const started = Date.now()
    const result = await Promise.all([
      repo.initializeRun(draft, refs),
      repo.initializeRun(draft, refs),
    ])
    expect(result[0]).toBe(result[1])
    await expectInsertedGraph(before, graph, result[0]!, started)
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
    const started = Date.now()
    const results = await Promise.allSettled([
      repo.initializeRun(first, refs),
      repo.initializeRun(second, refs),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')!
    expect(rejected.reason.message).toContain('Choose an unused laminate')
    const winner = results[0]!.status === 'fulfilled' ? first : second
    await expectInsertedGraph(
      before,
      buildInitialization(winner, refs),
      initializationIris(winner).run,
      started,
    )
  })
  it('accepts shop-floor executions with independent used plans and observation datasets', async () => {
    const draft = copySettings(
      merge(refs, await initializationSource()),
      sourceRun,
      refs,
      'integration-execution',
    )
    draft.name = 'Execution interoperability'
    draft.laminateConfirmed = true
    await useFreshLaminate(draft)
    const run = await repo.initializeRun(draft, refs)
    const plannedBefore = copySettings(
      merge(refs, await repo.getRunContext(run)),
      run,
      refs,
      draft.id,
    )
    const executeTemplate = async (file: string) => {
      const query = (
        await readFile(new URL('../../data/queries/updates/' + file, import.meta.url), 'utf8')
      )
        .replaceAll('http://purl.org/for/workflow/instance/EXAMPLE_UUID#it', run)
        .replace(
          'BIND(260.0 AS ?oven_threshold_temperature)',
          'BIND(265.0 AS ?oven_threshold_temperature)',
        )
        .replace('BIND(1000.0 AS ?press_force)', 'BIND(950.0 AS ?press_force)')
      await repo.update(query)
    }
    for (const stage of ['gripping', 'heating', 'pressing'])
      await executeTemplate('machine-activities/insert-' + stage + '.rq')
    const { readdir } = await import('node:fs/promises')
    const sensorFiles = await readdir(
      new URL('../../data/queries/updates/sensor-activities/', import.meta.url),
    )
    expect(sensorFiles).toHaveLength(29)
    for (const file of sensorFiles) await executeTemplate('sensor-activities/' + file)
    const recorded = await repo.getRunContext(run)
    expect(runActivities(recorded, run)).toHaveLength(37)
    expect(
      runActivities(recorded, run).filter((t) =>
        objects(recorded, t, NS.rdf + 'type').some(
          (type) => type.value === NS.sosa + 'Observation',
        ),
      ),
    ).toHaveLength(29)
    for (const stage of ['gripping', 'heating', 'pressing']) {
      const activity = runActivities(recorded, run).find(
        (t) => value(recorded, t, NS.wild + 'activityInstanceOf') === NS.activity + stage,
      )!
      expect(value(recorded, activity, NS.wild + 'hasState')).toBe(NS.wild + 'done')
      expect(activity.value).toContain('activity/instance/')
      const used = executionPlans(recorded, activity)
      expect(used).toHaveLength(1)
      expect(used[0]!.plan.termType).toBe('BlankNode')
      expect(used[0]!.plan.value).not.toBe(initializationIris(draft).plan(stage))
    }
    expect(recorded.getQuads(null, n(NS.for + 'initialization'), null, null)).toHaveLength(0)
    expect(recorded.getQuads(null, n(NS.for + 'initialized'), null, null)).toHaveLength(0)
    const heating = runActivities(recorded, run).find(
      (t) => value(recorded, t, NS.wild + 'activityInstanceOf') === NS.activity + 'heating',
    )!
    const usedHeating = executionPlans(recorded, heating)[0]!.plan
    expect(
      value(
        recorded,
        object(recorded, usedHeating, NS.oven + 'thresholdTemperature'),
        NS.qudt + 'value',
      ),
    ).toBe('265.0')
    const plannedAfter = copySettings(merge(refs, recorded), run, refs, draft.id)
    expect(plannedAfter).toEqual(plannedBefore)
    expect(plannedAfter.oven.threshold).toBe('260.0')
    expect((await repo.listDatasets({ run }, 100)).total).toBe(29)
    expect((await repo.listDatasets({ run, sensor: BASE + 'sensor/pyrometer/1#it' })).total).toBe(1)
    expect(value(recorded, run, NS.wild + 'hasState')).toBe(NS.wild + 'initialized')
    await executeTemplate('update-workflow-instance.rq')
    expect(value(await repo.getRunContext(run), run, NS.wild + 'hasState')).toBe(NS.wild + 'done')
  })
  it('does not double-count a dataset with multiple distributions', async () => {
    const node = df.blankNode(),
      graph = new Store()
    graph.addQuad(n(BASE + 'dataset#2'), n(NS.dcat + 'distribution'), node)
    graph.addQuad(node, n(NS.rdf + 'type'), n(NS.dcat + 'Distribution'))
    graph.addQuad(node, n(NS.dcat + 'mediaType'), df.literal('application/octet-stream'))
    await repo.update('INSERT DATA { ' + serialize(graph) + ' }')
    expect((await repo.listDatasets({ run: sourceRun })).total).toBe(4)
    expect((await repo.listRuns({ state: NS.wild + 'done' })).items[0]?.datasetCount).toBe(4)
    expect(
      objects(
        await repo.getDatasetContext(BASE + 'dataset#2'),
        BASE + 'dataset#2',
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

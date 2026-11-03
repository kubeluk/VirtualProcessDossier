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
import { seed } from '../../scripts/seed'
import { canonical, expectedInitialization, initializationSource, sourceRun } from '../helpers'
import { runActivities, runLaminate, datasetsFor } from '../../src/domain/model'
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
    expect((await repo.listRuns({ laminate: BASE + 'laminate/1#it' })).total).toBe(2)
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
  it('executes the supplied read-query contracts and preserves list, unit, and reference information', async () => {
    const readQuery = async (name: string) =>
      readFile(new URL('../../data/queries/reads/' + name, import.meta.url), 'utf8')
    expect(await repo.select(await readQuery('get-activity-instances.rq'))).toHaveLength(43)
    expect(await repo.select(await readQuery('get-observation-bindings.rq'))).toHaveLength(29)
    expect(await repo.select(await readQuery('get-workflow-instance.rq'))).toHaveLength(1)
    const graph = await repo.construct(await readQuery('get-initialization-plans.rq'))
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
    const before = await all(),
      source = await initializationSource()
    const draft = copySettings(merge(refs, source), sourceRun, refs, 'integration-create')
    draft.name = 'Integration "quoted"\nrun'
    draft.notes = 'Backslash \\ Unicode ä'
    draft.laminateConfirmed = true
    const generated = buildInitialization(draft, refs),
      expected = expectedInitialization(source, generated, draft)
    const uri = await repo.initializeRun(draft, refs)
    expect(uri).toBe(initializationIris(draft).run)
    expect(await canonical(await all())).toBe(await canonical(merge(before, expected)))
    const rows = await repo.select(
      `SELECT ?instance ?plan ?back WHERE { ?instance wild:inWorkflowInstance <${uri}> ; for:initialization ?plan . ?plan for:initialized ?back }`,
    )
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.instance!.value === row.back!.value)).toBe(true)
    expect(await repo.ask(`ASK { <${uri}> prov:startedAtTime ?time }`)).toBe(false)
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
    const before = await all(),
      graph = buildInitialization(draft, refs)
    const result = await Promise.all([
      repo.initializeRun(draft, refs),
      repo.initializeRun(draft, refs),
    ])
    expect(result[0]).toBe(result[1])
    expect(await canonical(await all())).toBe(await canonical(merge(before, graph)))
  })
  it('accepts demonstrator completion and dataset templates while preserving UI-created identities', async () => {
    const draft = copySettings(
      merge(refs, await repo.getRunContext(sourceRun)),
      sourceRun,
      refs,
      'integration-execution',
    )
    draft.name = 'Execution interoperability'
    draft.laminateConfirmed = true
    const run = await repo.initializeRun(draft, refs)
    const graph = await repo.getRunContext(run)
    const heating = runActivities(graph, run).find(
      (t) => value(graph, t, NS.wild + 'activityInstanceOf') === NS.activity + 'heating',
    )!
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
    const obs = runActivities(graph, run).find(
      (t) =>
        value(graph, t, NS.wild + 'activityInstanceOf') === NS.activity + 'observeGripperAngle1',
    )!
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

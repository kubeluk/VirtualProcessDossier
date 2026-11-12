import { beforeAll, describe, expect, it } from 'vitest'
import {
  BASE,
  NS,
  Store,
  n,
  df,
  merge,
  objects,
  object,
  typed,
  value,
  list,
  safeIri,
  addList,
} from '../../src/domain/rdf'
import {
  buildInitialization,
  copySettings,
  createDraft,
  draftErrors,
  initializationIris,
  SHAPES,
  validateInitialization,
  validatePlans,
  settingsFingerprint,
} from '../../src/domain/initialization'
import {
  flatten,
  workflowTree,
  runActivities,
  runLaminate,
  runPlans,
  executionPlans,
} from '../../src/domain/model'
import { readLaminate } from '../../src/domain/laminate'
import { observationExpectations } from '../../src/domain/expectations'
import {
  references,
  initializationSource,
  expectedInitialization,
  canonical,
  sourceRun,
  readStore,
} from '../helpers'
import type { InitializationDraft } from '../../src/domain/types'
import { buildSeedGraph, validateSeedGraph } from '../../scripts/seed'
let refs: Store, source: Store, draft: InitializationDraft
beforeAll(async () => {
  refs = await references()
  source = await initializationSource()
  draft = copySettings(merge(refs, source), sourceRun, refs, 'contract-test')
  draft.name = 'Run "quoted"\nwith a newline'
  draft.notes = 'Notes \\ and Unicode: Greifer'
  draft.laminateConfirmed = true
})
describe('initialization contract', () => {
  it('records the workflow generation time as a UTC xsd:dateTime', () => {
    const before = Date.now()
    const graph = buildInitialization(draft, refs)
    const after = Date.now()
    const timestamps = graph.getQuads(null, n(NS.prov + 'generatedAtTime'), null, null)
    expect(timestamps).toHaveLength(1)
    expect(timestamps[0]!.subject.value).toBe(initializationIris(draft).run)
    const timestamp = timestamps[0]!.object
    expect(timestamp.termType).toBe('Literal')
    if (timestamp.termType !== 'Literal') throw new Error('Expected a timestamp literal')
    expect(timestamp.datatype.value).toBe(NS.xsd + 'dateTime')
    expect(timestamp.value).toBe(new Date(timestamp.value).toISOString())
    expect(Date.parse(timestamp.value)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(timestamp.value)).toBeLessThanOrEqual(after)
  })
  it('matches the supplied initialization and plan graphs modulo named identities and blank nodes', async () => {
    const actual = await validateInitialization(draft, refs)
    const expected = expectedInitialization(source, actual, draft)
    expect(await canonical(actual)).toBe(await canonical(expected))
    expect(actual.size).toBe(expected.size)
  })
  it('instantiates only the five composite activities without fabrication of execution facts', () => {
    const graph = buildInitialization(draft, refs),
      ids = initializationIris(draft)
    expect(runActivities(graph, ids.run)).toHaveLength(5)
    expect(
      runActivities(graph, ids.run)
        .map((instance) => value(graph, instance, NS.wild + 'activityInstanceOf'))
        .sort(),
    ).toEqual(
      [
        'stampFormingFlow',
        'gripAndObserve',
        'manufactureAndObserve',
        'heatAndObserve',
        'inspection',
      ]
        .map((name) => NS.activity + name)
        .sort(),
    )
    expect(runPlans(graph, ids.run)).toHaveLength(3)
    for (const predicate of ['initialization', 'initialized'])
      expect(graph.getQuads(null, n(NS.for + predicate), null, null)).toHaveLength(0)
    expect(typed(graph, NS.prov + 'Plan')).toHaveLength(3)
    expect(typed(graph, NS.sosa + 'Observation')).toHaveLength(0)
    for (const predicate of [
      'startedAtTime',
      'endedAtTime',
      'wasAssociatedWith',
      'qualifiedAssociation',
      'wasGeneratedBy',
    ])
      expect(graph.getQuads(null, n(NS.prov + predicate), null, null)).toHaveLength(0)
    expect(graph.getQuads(null, n(NS.wild + 'hasState'), n(NS.wild + 'done'), null)).toHaveLength(0)
  })
  it('preserves workflow membership and sequential list order', () => {
    const tree = workflowTree(refs, draft.model)!
    expect(flatten(tree)).toHaveLength(43)
    expect(flatten(tree).filter((t) => t.type === 'atomic')).toHaveLength(38)
    expect(flatten(tree).filter((t) => observationExpectations.has(t.uri))).toHaveLength(29)
    expect(
      tree.children
        .find((t) => t.type === 'sequential')!
        .children.map((t) => t.uri.replace(NS.activity, '')),
    ).toEqual([
      'load',
      'moveToOven',
      'heatAndObserve',
      'moveToPress',
      'pressing',
      'moveToInspection',
      'inspection',
      'moveToUnload',
      'unload',
    ])
  })
  it('copies collection-owned plans with arbitrary IRIs before atomic instances exist', () => {
    const graph = buildInitialization(draft, refs),
      ids = initializationIris(draft)
    const replacements = new Map(
      ['gripping', 'heating', 'pressing'].map((stage, i) => [
        ids.plan(stage),
        BASE + 'plan/random-' + i + '#it',
      ]),
    )
    const remap = (term: Parameters<typeof df.quad>[2]) =>
      replacements.has(term.value) ? n(replacements.get(term.value)!) : term
    const renamed = new Store(
      [...graph].map((q) => df.quad(q.subject, q.predicate, remap(q.object) as typeof q.object)),
    )
    for (const q of renamed.getQuads(null, null, null, null)) {
      if (!replacements.has(q.subject.value)) continue
      renamed.removeQuad(q)
      renamed.addQuad(n(replacements.get(q.subject.value)!), q.predicate, q.object)
    }
    const copy = copySettings(merge(refs, renamed), ids.run, refs)
    copy.name = draft.name
    copy.notes = draft.notes
    expect(settingsFingerprint(copy)).toBe(settingsFingerprint(draft))
  })
  it('rejects missing and ambiguous collection plans without guessing', () => {
    const graph = buildInitialization(draft, refs),
      ids = initializationIris(draft)
    const collection = object(
      graph,
      object(graph, ids.run, NS.for + 'workflowInitialization'),
      NS.for + 'parameterization',
    )!
    graph.addQuad(
      collection as ReturnType<typeof n>,
      n(NS.prov + 'hadMember'),
      n(BASE + 'plan/extra'),
    )
    graph.addQuad(n(BASE + 'plan/extra'), n(NS.oven + 'thresholdTemperature'), df.blankNode())
    expect(() => copySettings(graph, ids.run, refs)).toThrow('exactly one heating')
    graph.removeQuads(
      graph.getQuads(n(ids.plan('heating')), n(NS.oven + 'thresholdTemperature'), null, null),
    )
    graph.removeQuads(graph.getQuads(n(BASE + 'plan/extra'), null, null, null))
    expect(() => copySettings(graph, ids.run, refs)).toThrow('exactly one heating')
  })
  it('uses scoped defaults and leaves undeclared gripper coordinates empty', () => {
    const fresh = createDraft(refs)
    expect(fresh.grippers).toHaveLength(8)
    expect(fresh.grippers[0]).toMatchObject({
      x: '',
      y: '',
      gripping: '60',
      heating: '60',
      pressing: '60',
    })
    expect(fresh.oven).toMatchObject({ threshold: '260.0', holding: '5.0' })
    expect(fresh.oven.fields).toHaveLength(8)
    expect(fresh.oven).not.toHaveProperty('devices')
    expect(fresh.press).not.toHaveProperty('devices')
    expect(fresh.press.steps).toEqual([
      { speed: '80.0', distance: '60.0' },
      { speed: '60.0', distance: '25.0' },
      { speed: '35.0', distance: '10.0' },
      { speed: '10.0', distance: '0.0' },
    ])
  })
  it('copies values into independent identities and requires confirmation', () => {
    const copy = copySettings(merge(refs, source), sourceRun, refs, 'independent-copy')
    expect(copy.laminateConfirmed).toBe(false)
    expect(copy.copiedFrom).toBe(sourceRun)
    expect(initializationIris(copy).run).not.toBe(sourceRun)
    copy.grippers[0]!.x = '999.0'
    expect(
      value(
        source,
        object(
          source,
          objects(source, BASE + 'plan/1#gripping', NS.frame + 'gripperPosition')[0],
          NS.frame + 'position',
        ),
        NS.qudt + 'value',
      ),
    ).not.toBe('999.0')
    expect(draft.grippers[0]!.x).toBe('210.0')
  })
  it.each([
    [
      'missing coordinate',
      (d: InitializationDraft) => {
        d.grippers[0]!.x = ''
      },
    ],
    [
      'non-integer setpoint',
      (d: InitializationDraft) => {
        d.grippers[0]!.heating = '1.2'
      },
    ],
    [
      'duplicate gripper',
      (d: InitializationDraft) => {
        d.grippers[1]!.iri = d.grippers[0]!.iri
      },
    ],
    [
      'duplicate field',
      (d: InitializationDraft) => {
        d.oven.fields[1]!.iri = d.oven.fields[0]!.iri
      },
    ],
    [
      'empty profile',
      (d: InitializationDraft) => {
        d.press.steps = []
      },
    ],
    [
      'infinite number',
      (d: InitializationDraft) => {
        d.press.force = 'Infinity'
      },
    ],
    [
      'missing confirmation',
      (d: InitializationDraft) => {
        d.laminateConfirmed = false
      },
    ],
  ])('rejects %s before any write', (_name, change) => {
    const invalid = structuredClone(draft)
    change(invalid)
    expect(draftErrors(invalid, refs).length).toBeGreaterThan(0)
    expect(() => buildInitialization(invalid, refs)).toThrow()
  })
  it('accepts older stored plan shapes without migrating them', async () => {
    const older = new Store(refs.getQuads(null, null, null, null))
    const link = df.blankNode()
    older.addQuad(n(NS.param + 'planShape'), n(NS.sh + 'property'), link)
    older.addQuad(link, n(NS.sh + 'path'), n(NS.for + 'initialized'))
    older.addQuad(link, n(NS.sh + 'minCount'), df.literal('1', n(NS.xsd + 'integer')))
    const heater = df.blankNode()
    const heaterComponents = df.blankNode()
    older.addQuad(n(SHAPES.pressing), n(NS.sh + 'property'), heater)
    older.addQuad(heater, n(NS.sh + 'path'), n(NS.oven + 'heatingDeviceTargetTemperature'))
    older.addQuad(heater, n(NS.sh + 'minCount'), df.literal('2', n(NS.xsd + 'integer')))
    older.addQuad(n(SHAPES.pressing), n(NS.sh + 'property'), heaterComponents)
    older.addQuad(
      heaterComponents,
      n(NS.sh + 'path'),
      addList(older, [
        n(NS.oven + 'heatingDeviceTargetTemperature'),
        n(NS.oven + 'atDevice'),
      ]) as ReturnType<typeof n>,
    )
    older.addQuad(heaterComponents, n(NS.sh + 'minCount'), df.literal('2', n(NS.xsd + 'integer')))
    const before = await canonical(older)
    await expect(validateInitialization(draft, older)).resolves.toBeInstanceOf(Store)
    expect(await canonical(older)).toBe(before)
  })
  it('validates targetless equipment shapes explicitly and rejects incorrect units and datatypes', async () => {
    const graph = buildInitialization(draft, refs),
      plan = initializationIris(draft).plan('heating')
    const threshold = object(graph, plan, NS.oven + 'thresholdTemperature')!
    graph.removeQuads(graph.getQuads(threshold, n(NS.qudt + 'hasUnit'), null, null))
    graph.addQuad(threshold as ReturnType<typeof n>, n(NS.qudt + 'hasUnit'), n(NS.unit + 'SEC'))
    expect(await validatePlans(graph, refs, [{ plan, shape: SHAPES.heating }])).not.toEqual([])
    graph.removeQuads(graph.getQuads(threshold, n(NS.qudt + 'hasUnit'), null, null))
    graph.addQuad(threshold as ReturnType<typeof n>, n(NS.qudt + 'hasUnit'), n(NS.unit + 'DEG_C'))
    graph.removeQuads(graph.getQuads(threshold, n(NS.qudt + 'value'), null, null))
    graph.addQuad(
      threshold as ReturnType<typeof n>,
      n(NS.qudt + 'value'),
      df.literal('260', n(NS.xsd + 'integer')),
    )
    expect(await validatePlans(graph, refs, [{ plan, shape: SHAPES.heating }])).not.toEqual([])
  })
  it('round-trips profile order and normalizes equivalent numeric spellings for retries', () => {
    const actual = buildInitialization(draft, refs),
      copy = copySettings(merge(refs, actual), initializationIris(draft).run, refs)
    copy.name = draft.name
    copy.notes = draft.notes
    expect(settingsFingerprint(copy)).toBe(settingsFingerprint(draft))
    copy.oven.threshold = '0260.000'
    expect(settingsFingerprint(copy)).toBe(settingsFingerprint(draft))
    copy.press.steps.reverse()
    expect(settingsFingerprint(copy)).not.toBe(settingsFingerprint(draft))
  })
  it('preserves mold temperatures without creating redundant heater quantities', async () => {
    const edited = structuredClone(draft)
    edited.press.molds[0]!.value = '115.0'
    edited.press.molds[1]!.value = '120.0'
    const graph = await validateInitialization(edited, refs)
    expect(
      graph.getQuads(null, n(NS.oven + 'heatingDeviceTargetTemperature'), null, null),
    ).toHaveLength(0)
    const copy = copySettings(merge(refs, graph), initializationIris(edited).run, refs)
    expect(copy.press.molds).toEqual(edited.press.molds)
    expect(copy.press).not.toHaveProperty('devices')
    copy.press.molds[0]!.value = '125.0'
    expect(edited.press.molds[0]!.value).toBe('115.0')
  })
  it.each([
    'missing mold',
    'duplicate mold',
    'wrong quantity kind',
    'wrong unit',
    'wrong datatype',
  ])('validates mold temperatures: %s', async (change) => {
    const graph = buildInitialization(draft, refs)
    const plan = initializationIris(draft).plan('pressing')
    const entries = graph.getQuads(n(plan), n(NS.press + 'moldTemperature'), null, null)
    const entry = entries[0]!.object
    const quantity = object(graph, entry, NS.press + 'temperature')! as ReturnType<typeof n>
    if (change === 'missing mold') graph.removeQuad(entries[0]!)
    if (change === 'duplicate mold') {
      graph.removeQuads(graph.getQuads(entry, n(NS.press + 'mold'), null, null))
      graph.addQuad(
        entry as ReturnType<typeof n>,
        n(NS.press + 'mold'),
        object(graph, entries[1]!.object, NS.press + 'mold')! as ReturnType<typeof n>,
      )
    }
    const property =
      change === 'wrong quantity kind'
        ? 'hasQuantityKind'
        : change === 'wrong unit'
          ? 'hasUnit'
          : 'value'
    if (change.startsWith('wrong')) {
      graph.removeQuads(graph.getQuads(quantity, n(NS.qudt + property), null, null))
      graph.addQuad(
        quantity,
        n(NS.qudt + property),
        change === 'wrong quantity kind'
          ? n(NS.kind + 'AreaTemperature')
          : change === 'wrong unit'
            ? n(NS.unit + 'SEC')
            : df.literal('110', n(NS.xsd + 'integer')),
      )
    }
    expect(await validatePlans(graph, refs, [{ plan, shape: SHAPES.pressing }])).not.toEqual([])
  })
})
describe('RDF integrity and seed fixtures', () => {
  it('rejects malformed and cyclic lists without hanging', () => {
    const graph = new Store(),
      head = df.blankNode()
    graph.addQuad(head, n(NS.rdf + 'first'), df.literal('x'))
    expect(() => list(graph, head)).toThrow('incomplete')
    graph.addQuad(head, n(NS.rdf + 'rest'), head)
    expect(() => list(graph, head)).toThrow('cycle')
  })
  it('validates IRI boundaries', () => {
    expect(safeIri(BASE + 'laminate/1#it')).toContain('laminate')
    for (const input of [
      'http://example/a> . ?s ?p ?o',
      'relative/path',
      'http://x/ bad',
      'http://x/\\bad',
    ])
      expect(() => safeIri(input)).toThrow()
  })
  it('parses and validates all supplied examples and distinct seed states', async () => {
    for (const file of [
      'catalog.ttl',
      'laminate.ttl',
      'parameter.ttl',
      'plan.ttl',
      'properties.ttl',
      'run-view-after-demo.ttl',
      'run-view-after-ui.ttl',
      'system.ttl',
      'workflow.ttl',
    ])
      expect((await readStore(file)).size).toBeGreaterThan(0)
    const graph = await buildSeedGraph()
    await expect(validateSeedGraph(graph)).resolves.toBeUndefined()
    expect(typed(graph, NS.wild + 'WorkflowInstance')).toHaveLength(2)
    expect(value(graph, sourceRun, NS.wild + 'hasState')).toBe(NS.wild + 'done')
    expect(value(graph, BASE + 'workflow/instance/demo-initialized#it', NS.wild + 'hasState')).toBe(
      NS.wild + 'initialized',
    )
    expect(typed(graph, NS.dcat + 'Dataset')).toHaveLength(5)
    expect(value(graph, BASE + 'observation#ex1', NS.wild + 'inWorkflowInstance')).toBe('')
  })
  it('seeds an independent laminate for the initialized workflow without execution facts', async () => {
    const graph = await buildSeedGraph()
    const run = BASE + 'workflow/instance/demo-initialized#it'
    const original = BASE + 'laminate/1#it'
    const laminate = BASE + 'laminate/demo-initialized#it'
    expect(typed(graph, NS.for + 'Laminate')).toHaveLength(2)
    expect(runLaminate(graph, sourceRun)).toBe(original)
    expect(runLaminate(graph, run)).toBe(laminate)
    const material = readLaminate(graph, original)
    expect(readLaminate(graph, laminate)).toMatchObject({
      uri: laminate,
      name: 'BASF PA6-GF60 (initialized example)',
      identifier: 'demo-initialized',
      length: '400',
      width: '400',
      thickness: '1.56',
      layupName: material.layupName,
      layers: material.layers,
      needles: material.needles.map((point) => ({
        ...point,
        x: String(Number(point.x)),
        y: String(Number(point.y)),
      })),
    })
    for (const predicate of [
      NS.geo + 'hasSize',
      NS.param + 'hasNeedlePoint',
      NS.prov + 'wasDerivedFrom',
    ]) {
      const originalResources = objects(graph, original, predicate).map((term) => term.value)
      for (const resource of objects(graph, laminate, predicate))
        expect(originalResources).not.toContain(resource.value)
    }
    expect(runActivities(graph, run)).toHaveLength(5)
    for (const instance of [n(run), ...runActivities(graph, run)]) {
      expect(value(graph, instance, NS.wild + 'hasState')).toBe(NS.wild + 'initialized')
      expect(objects(graph, instance, NS.prov + 'startedAtTime')).toHaveLength(0)
      expect(objects(graph, instance, NS.prov + 'endedAtTime')).toHaveLength(0)
      expect(objects(graph, instance, NS.sosa + 'hasFeatureOfInterest')).toHaveLength(0)
    }
  })
  it('rejects seed workflows that share a laminate', async () => {
    const graph = await buildSeedGraph()
    const initialization = object(
      graph,
      BASE + 'workflow/instance/demo-initialized#it',
      NS.for + 'workflowInitialization',
    )!
    graph.removeQuads(graph.getQuads(initialization, n(NS.for + 'laminate'), null, null))
    graph.addQuad(
      initialization as ReturnType<typeof n>,
      n(NS.for + 'laminate'),
      n(BASE + 'laminate/1#it'),
    )
    await expect(validateSeedGraph(graph)).rejects.toThrow(
      'A seed laminate is assigned to more than one workflow instance.',
    )
  })
  it('rejects malformed seed values before they can be uploaded', async () => {
    const graph = await buildSeedGraph()
    const size = object(graph, BASE + 'laminate/1#it', NS.geo + 'hasSize')!
    graph.removeQuads(graph.getQuads(size, n(NS.qudt + 'hasUnit'), null, null))
    graph.addQuad(size as ReturnType<typeof n>, n(NS.qudt + 'hasUnit'), n(NS.unit + 'SEC'))
    await expect(validateSeedGraph(graph)).rejects.toThrow('material')
  })
  it('rejects invalid used-plan quantities on anonymous execution plans', async () => {
    const graph = await buildSeedGraph()
    const used = executionPlans(graph, BASE + 'workflow/instance/1#pressing')[0]!.plan
    const force = object(graph, used, NS.press + 'force')! as ReturnType<typeof n>
    graph.removeQuads(graph.getQuads(force, n(NS.qudt + 'hasUnit'), null, null))
    graph.addQuad(force, n(NS.qudt + 'hasUnit'), n(NS.unit + 'SEC'))
    await expect(validateSeedGraph(graph)).rejects.toThrow('equipment shape')
  })
})

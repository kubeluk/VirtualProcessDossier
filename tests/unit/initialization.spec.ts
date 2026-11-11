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
import { flatten, workflowTree, runActivities, runLaminate, runPlans } from '../../src/domain/model'
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
    expect(fresh.press.devices).toEqual([
      { iri: BASE + 'system/heater/1#it', value: '300.0' },
      { iri: BASE + 'system/heater/2#it', value: '300.0' },
    ])
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
      'missing heater',
      (d: InitializationDraft) => {
        d.press.devices.pop()
      },
    ],
    [
      'duplicate heater',
      (d: InitializationDraft) => {
        d.press.devices[1]!.iri = d.press.devices[0]!.iri
      },
    ],
    [
      'missing heater target',
      (d: InitializationDraft) => {
        d.press.devices[0]!.value = ''
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
    const link = objects(older, NS.param + 'planShape', NS.sh + 'property').find(
      (node) => value(older, node, NS.sh + 'path') === NS.for + 'initialized',
    )!
    older.addQuad(
      link as ReturnType<typeof n>,
      n(NS.sh + 'minCount'),
      df.literal('1', n(NS.xsd + 'integer')),
    )
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
  it('writes and copies distinct heater targets on the pressing plan with temperature quantities', async () => {
    const edited = structuredClone(draft)
    edited.press.devices[0]!.value = '305.0'
    edited.press.devices[1]!.value = '315.0'
    expect(settingsFingerprint(edited)).not.toBe(settingsFingerprint(draft))
    const graph = await validateInitialization(edited, refs)
    const ids = initializationIris(edited)
    expect(objects(graph, ids.plan('heating'), NS.oven + 'heatingDeviceTargetTemperature')).toEqual(
      [],
    )
    const entries = objects(graph, ids.plan('pressing'), NS.oven + 'heatingDeviceTargetTemperature')
    expect(entries).toHaveLength(2)
    for (const [index, entry] of entries.entries()) {
      expect(value(graph, entry, NS.oven + 'atDevice')).toBe(edited.press.devices[index]!.iri)
      const quantity = object(graph, entry, NS.oven + 'deviceTemperature')!
      expect(value(graph, quantity, NS.qudt + 'hasQuantityKind')).toBe(NS.kind + 'Temperature')
      expect(value(graph, quantity, NS.qudt + 'hasUnit')).toBe(NS.unit + 'DEG_C')
      expect(value(graph, quantity, NS.qudt + 'value')).toBe(edited.press.devices[index]!.value)
    }
    const copy = copySettings(merge(refs, graph), ids.run, refs)
    expect(copy.press.devices).toEqual(edited.press.devices)
    copy.press.devices[0]!.value = '320.0'
    expect(edited.press.devices[0]!.value).toBe('305.0')
  })
  it.each([
    'missing heater',
    'duplicate heater',
    'wrong quantity kind',
    'wrong unit',
    'wrong datatype',
    'heater targets on heating',
  ])('validates press heater constraints explicitly: %s', async (change) => {
    const graph = buildInitialization(draft, refs)
    const ids = initializationIris(draft)
    const plan = ids.plan('pressing')
    const predicate = n(NS.oven + 'heatingDeviceTargetTemperature')
    const entries = graph.getQuads(n(plan), predicate, null, null)
    const entry = entries[0]!.object
    const quantity = object(graph, entry, NS.oven + 'deviceTemperature')! as ReturnType<typeof n>
    if (change === 'missing heater') graph.removeQuad(entries[0]!)
    if (change === 'duplicate heater') {
      graph.removeQuads(graph.getQuads(entry, n(NS.oven + 'atDevice'), null, null))
      graph.addQuad(
        entry as ReturnType<typeof n>,
        n(NS.oven + 'atDevice'),
        object(graph, entries[1]!.object, NS.oven + 'atDevice')! as ReturnType<typeof n>,
      )
    }
    if (
      change === 'wrong quantity kind' ||
      change === 'wrong unit' ||
      change === 'wrong datatype'
    ) {
      const [property, replacement]: [
        string,
        ReturnType<typeof n> | ReturnType<typeof df.literal>,
      ] =
        change === 'wrong quantity kind'
          ? ['hasQuantityKind', n(NS.kind + 'AreaTemperature')]
          : change === 'wrong unit'
            ? ['hasUnit', n(NS.unit + 'SEC')]
            : ['value', df.literal('300', n(NS.xsd + 'integer'))]
      graph.removeQuads(graph.getQuads(quantity, n(NS.qudt + property), null, null))
      graph.addQuad(quantity, n(NS.qudt + property), replacement!)
    }
    if (change === 'heater targets on heating') {
      for (const triple of entries) {
        graph.removeQuad(triple)
        graph.addQuad(n(ids.plan('heating')), predicate, triple.object)
      }
      expect(
        await validatePlans(graph, refs, [{ plan: ids.plan('heating'), shape: SHAPES.heating }]),
      ).toEqual([])
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
})

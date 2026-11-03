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
import { flatten, workflowTree, runActivities } from '../../src/domain/model'
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
    expect(actual.size).toBe(source.size)
  })
  it('instantiates all 43 activities without fabrication of execution facts', () => {
    const graph = buildInitialization(draft, refs),
      ids = initializationIris(draft)
    expect(runActivities(graph, ids.run)).toHaveLength(43)
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
    expect(fresh.oven.devices).toHaveLength(2)
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
  it('rejects malformed seed values before they can be uploaded', async () => {
    const graph = await buildSeedGraph()
    const size = object(graph, BASE + 'laminate/1#it', NS.geo + 'hasSize')!
    graph.removeQuads(graph.getQuads(size, n(NS.qudt + 'hasUnit'), null, null))
    graph.addQuad(size as ReturnType<typeof n>, n(NS.qudt + 'hasUnit'), n(NS.unit + 'SEC'))
    await expect(validateSeedGraph(graph)).rejects.toThrow('material')
  })
})

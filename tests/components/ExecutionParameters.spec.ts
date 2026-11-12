// @vitest-environment jsdom
import { beforeAll, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ExecutionParameters from '../../src/components/ExecutionParameters.vue'
import { BASE, NS, Store, df, n, object, merge, value, typed } from '../../src/domain/rdf'
import { executionPlans, runPlans } from '../../src/domain/model'
import { copySettings, validatePlans, SHAPES } from '../../src/domain/initialization'
import { usedParameterGroups } from '../../src/domain/parameters'
import { buildSeedGraph } from '../../scripts/seed'
import { sourceRun } from '../helpers'
import { useKnowledgeStore } from '../../src/stores/knowledge'

let seed: Store
const heating = BASE + 'workflow/instance/1#heating'
beforeAll(async () => {
  seed = await buildSeedGraph()
})
async function render(graph: Store, activity = heating) {
  const pinia = createPinia()
  setActivePinia(pinia)
  useKnowledgeStore().references = graph
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  return mount(ExecutionParameters, {
    props: { graph, activity },
    global: { plugins: [pinia, router] },
  })
}

it.each(['blank', 'named'])(
  'reads and validates a %s used plan without changing planned settings',
  async (kind) => {
    const graph = merge(seed)
    const original = executionPlans(graph, heating)[0]!
    let plan = original.plan
    if (kind === 'named') {
      const named = n('urn:test:used-heating')
      for (const triple of graph.getQuads(plan, null, null, null)) {
        graph.removeQuad(triple)
        graph.addQuad(named, triple.predicate, triple.object)
      }
      graph.removeQuads(graph.getQuads(original.association, n(NS.prov + 'hadPlan'), null, null))
      graph.addQuad(original.association as ReturnType<typeof n>, n(NS.prov + 'hadPlan'), named)
      plan = named
    }
    const threshold = object(graph, plan, NS.oven + 'thresholdTemperature')! as ReturnType<typeof n>
    graph.removeQuads(graph.getQuads(threshold, n(NS.qudt + 'value'), null, null))
    graph.addQuad(threshold, n(NS.qudt + 'value'), df.literal('265.0', n(NS.xsd + 'decimal')))
    expect(await validatePlans(graph, graph, [{ plan, shape: SHAPES.heating }])).toEqual([])
    expect(runPlans(graph, sourceRun)).toHaveLength(3)
    expect(copySettings(graph, sourceRun, graph).oven.threshold).toBe('260.0')
    const wrapper = await render(graph)
    expect(wrapper.text()).toContain('Recorded used settings')
    expect(wrapper.text()).toContain('Infrared (IR) Oven')
    expect(wrapper.text()).toContain('265 °C')
    expect(wrapper.text()).not.toContain('260 °C')
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(
      wrapper.findAll('a').some((a) => a.attributes('href')?.includes(original.plan.value)),
    ).toBe(false)
    wrapper.unmount()
  },
)

it('keeps missing execution values and equipment explicit without falling back to defaults', async () => {
  const graph = merge(seed)
  const record = executionPlans(graph, heating)[0]!
  graph.removeQuads(graph.getQuads(record.plan, n(NS.oven + 'thresholdTemperature'), null, null))
  graph.removeQuads(graph.getQuads(record.association, n(NS.prov + 'agent'), null, null))
  const groups = usedParameterGroups(graph, heating, record.plan)
  expect(groups[0]!.rows[0]!.quantities).toEqual([])
  const wrapper = await render(graph)
  expect(wrapper.text()).toContain('Not recorded')
  expect(wrapper.text()).not.toContain('260 °C')
  wrapper.unmount()
})

it('does not present planned settings as an execution when no used plan is recorded', async () => {
  const graph = merge(seed)
  graph.removeQuads(graph.getQuads(n(heating), n(NS.prov + 'qualifiedAssociation'), null, null))
  expect(runPlans(graph, sourceRun)).toHaveLength(3)
  const wrapper = await render(graph)
  expect(wrapper.text()).toBe('No used settings recorded.')
  wrapper.unmount()
})

it('keeps multiple associations separate and reports malformed closing lists', async () => {
  const graph = merge(seed)
  const pressing = BASE + 'workflow/instance/1#pressing'
  const record = executionPlans(graph, pressing)[0]!
  const head = object(graph, record.plan, NS.press + 'closingSteps')!
  graph.removeQuads(graph.getQuads(head, n(NS.rdf + 'rest'), null, null))
  const other = df.blankNode()
  graph.addQuad(n(pressing), n(NS.prov + 'qualifiedAssociation'), other)
  graph.addQuad(other, n(NS.prov + 'hadPlan'), n('urn:test:missing-plan'))
  expect(executionPlans(graph, pressing)).toHaveLength(2)
  const wrapper = await render(graph, pressing)
  expect(wrapper.text()).toContain('Recorded used settings 1')
  expect(wrapper.text()).toContain('Recorded used settings 2')
  expect(wrapper.text()).toContain('This ordered list is incomplete.')
  wrapper.unmount()
})

it('retains ordered used press steps and every observation in the completed fixture', () => {
  const pressing = BASE + 'workflow/instance/1#pressing'
  const record = executionPlans(seed, pressing)[0]!
  const groups = usedParameterGroups(seed, pressing, record.plan)
  const profile = groups.find((group) => group.name === 'Ordered closing profile')!
  expect(
    profile.rows
      .filter((row) => row.name.endsWith('closing speed'))
      .map((row) => value(seed, row.quantities[0], NS.qudt + 'value')),
  ).toEqual(['80.0', '60.0', '35.0', '10.0'])
  expect(
    typed(seed, NS.sosa + 'Observation').filter(
      (obs) => value(seed, obs, NS.wild + 'inWorkflowInstance') === sourceRun,
    ),
  ).toHaveLength(29)
})

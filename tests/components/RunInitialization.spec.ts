// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import RunView from '../../src/views/RunView.vue'
import { useKnowledgeStore } from '../../src/stores/knowledge'
import { repository } from '../../src/services/repository'
import {
  buildInitialization,
  copySettings,
  initializationIris,
} from '../../src/domain/initialization'
import { BASE, NS, Store, merge, n, df, object } from '../../src/domain/rdf'
import { executionPlans } from '../../src/domain/model'
import { buildSeedGraph } from '../../scripts/seed'
import { references, initializationSource, sourceRun } from '../helpers'

let refs: Store, source: Store
beforeAll(async () => {
  refs = await references()
  source = await initializationSource()
})
afterEach(() => vi.restoreAllMocks())
it('shows saved parameters and missing atomic execution records before shop-floor initialization', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const knowledge = useKnowledgeStore()
  knowledge.references = refs
  knowledge.loaded = true
  const draft = copySettings(merge(refs, source), sourceRun, refs, 'unexecuted-run')
  draft.name = 'Prepared run'
  draft.laminateConfirmed = true
  draft.press.force = '912.0'
  const graph = buildInitialization(draft, refs)
  vi.spyOn(repository, 'getRunContext').mockResolvedValue(graph)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push({
    path: '/runs/detail',
    query: { uri: initializationIris(draft).run, tab: 'parameters' },
  })
  await router.isReady()
  const wrapper = mount(RunView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  expect(wrapper.text()).toContain('912')
  expect(wrapper.text()).toContain('No used settings recorded.')
  expect(wrapper.text()).not.toContain('exactly one')
  await router.push({ query: { ...router.currentRoute.value.query, tab: 'process' } })
  await flushPromises()
  expect(wrapper.text()).toContain('No execution record')
  expect(wrapper.text()).toContain('Initialized')
  expect(wrapper.text()).toContain('Planned observation configuration')
  wrapper.unmount()
})

it('shows planned and independently used settings in both parameters and process details', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const knowledge = useKnowledgeStore()
  knowledge.references = refs
  knowledge.loaded = true
  const graph = await buildSeedGraph()
  const heating = BASE + 'workflow/instance/1#heating'
  const used = executionPlans(graph, heating)[0]!.plan
  const threshold = object(graph, used, NS.oven + 'thresholdTemperature')! as ReturnType<typeof n>
  graph.removeQuads(graph.getQuads(threshold, n(NS.qudt + 'value'), null, null))
  graph.addQuad(threshold, n(NS.qudt + 'value'), df.literal('265.0', n(NS.xsd + 'decimal')))
  vi.spyOn(repository, 'getRunContext').mockResolvedValue(graph)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push({ path: '/runs/detail', query: { uri: sourceRun, tab: 'parameters' } })
  const wrapper = mount(RunView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  expect(wrapper.text()).toContain('Planned settings')
  expect(wrapper.text()).toContain('260 °C')
  expect(wrapper.text()).toContain('Recorded used settings')
  expect(wrapper.text()).toContain('265 °C')
  expect(wrapper.findAll('input')).toHaveLength(0)
  await router.push({ query: { ...router.currentRoute.value.query, tab: 'process' } })
  await flushPromises()
  expect(wrapper.text()).toContain('Recorded used settings')
  expect(wrapper.text()).toContain('265 °C')
  wrapper.unmount()
})

// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PrepareRunView from '../../src/views/PrepareRunView.vue'
import { repository } from '../../src/services/repository'
import { useKnowledgeStore } from '../../src/stores/knowledge'
import { Store, merge } from '../../src/domain/rdf'
import { references, initializationSource, sourceRun } from '../helpers'

let refs: Store, source: Store
beforeAll(async () => {
  refs = await references()
  source = await initializationSource()
})
beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(repository, 'getReferenceGraph').mockResolvedValue(refs)
  vi.spyOn(repository, 'facets').mockResolvedValue([
    { kind: 'run', uri: sourceRun, label: 'Trial No. 1' },
  ])
  vi.spyOn(repository, 'getRunContext').mockResolvedValue(merge(refs, source))
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('run preparation lifecycle', () => {
  async function setup(query = '') {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/runs/new', component: PrepareRunView },
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    })
    await router.push('/runs/new' + query)
    const wrapper = mount(PrepareRunView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    return { wrapper, router }
  }
  it('loads defaults on a direct visit without needing a watched route parameter', async () => {
    const { wrapper } = await setup()
    expect(repository.facets).toHaveBeenCalled()
    expect(wrapper.text()).toContain('How would you like to begin?')
    expect(wrapper.text()).not.toContain('Loading context')
    wrapper.unmount()
  })
  it('loads copied values and replaces the one-time copy URL so a reload restores edited values', async () => {
    const { wrapper, router } = await setup('?copy=' + encodeURIComponent(sourceRun))
    expect(repository.getRunContext).toHaveBeenCalledWith(sourceRun)
    expect(wrapper.find('input[aria-label="Run name"]').exists()).toBe(true)
    expect(router.currentRoute.value.query.copy).toBeUndefined()
    await wrapper.get('input[aria-label="Run name"]').setValue('Edited draft')
    await flushPromises()
    expect(JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft.name).toBe(
      'Edited draft',
    )
    wrapper.unmount()
    const restored = await setup()
    expect(
      (restored.wrapper.get('input[aria-label="Run name"]').element as HTMLInputElement).value,
    ).toBe('Edited draft')
    restored.wrapper.unmount()
  })
  it('shares an in-flight reference load with the application shell', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const knowledge = useKnowledgeStore()
    const pending = knowledge.loadReferences()
    await pending
    expect(knowledge.loaded).toBe(true)
    expect(knowledge.references.size).toBeGreaterThan(0)
  })
})

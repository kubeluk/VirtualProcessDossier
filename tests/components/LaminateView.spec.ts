// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LaminateView from '../../src/views/LaminateView.vue'
import { repository } from '../../src/services/repository'
import { NS, parse } from '../../src/domain/rdf'

afterEach(() => vi.restoreAllMocks())

it.each(['loaded', 'loading', 'error', 'missing'])(
  'offers QR only for a loaded laminate: %s',
  async (state) => {
    const uri = 'http://purl.org/for/laminate/1#it'
    const refs = vi.spyOn(repository, 'getReferenceGraph')
    if (state === 'loading') refs.mockReturnValue(new Promise(() => {}))
    else if (state === 'error') refs.mockRejectedValue(new Error('Offline'))
    else
      refs.mockResolvedValue(parse(state === 'missing' ? '' : `<${uri}> a <${NS.for}Laminate> .`))
    vi.spyOn(repository, 'listRuns').mockResolvedValue({ items: [], total: 0 })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push({ path: '/laminate', query: { uri } })
    const wrapper = mount(LaminateView, {
      global: {
        plugins: [createPinia(), router],
        stubs: { LaminateSummary: true, AllMetadata: true },
      },
    })
    await flushPromises()
    expect(wrapper.text().includes('Generate QR code')).toBe(state === 'loaded')
    if (state === 'missing') expect(wrapper.text()).toContain('Laminate not found.')
    wrapper.unmount()
  },
)

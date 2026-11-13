// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LaminateView from '../../src/views/LaminateView.vue'
import { repository } from '../../src/services/repository'
import { NS, parse } from '../../src/domain/rdf'
import type { Page, RunSummary } from '../../src/domain/types'
import { generateLaminateQr } from '../../src/utils/laminateQr'

vi.mock('../../src/utils/laminateQr', async (original) => ({
  ...(await original<typeof import('../../src/utils/laminateQr')>()),
  generateLaminateQr: vi.fn(),
}))

afterEach(() => vi.restoreAllMocks())

const uri = 'http://purl.org/for/laminate/1#it'
async function render(state = 'loaded', runs: Page<RunSummary> = { items: [], total: 0 }) {
  const refs = vi.spyOn(repository, 'getReferenceGraph')
  if (state === 'loading') refs.mockReturnValue(new Promise(() => {}))
  else if (state === 'error') refs.mockRejectedValue(new Error('Offline'))
  else refs.mockResolvedValue(parse(state === 'missing' ? '' : `<${uri}> a <${NS.for}Laminate> .`))
  vi.spyOn(repository, 'listRuns').mockResolvedValue(runs)
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
  return { wrapper, router }
}

it.each(['loaded', 'loading', 'error', 'missing'])(
  'offers QR only for a loaded laminate: %s',
  async (state) => {
    const { wrapper } = await render(state)
    expect(wrapper.text().includes('Generate QR code')).toBe(state === 'loaded')
    if (state === 'missing') expect(wrapper.text()).toContain('Laminate not found.')
    wrapper.unmount()
  },
)

it.each(['done', 'initialized', ''])(
  'blocks deletion for an assigned laminate: %s',
  async (state) => {
    const remove = vi.spyOn(repository, 'deleteLaminate').mockResolvedValue()
    const { wrapper } = await render('loaded', {
      total: 1,
      items: [
        {
          uri: 'urn:test:run',
          label: 'Associated run',
          state: state && NS.wild + state,
          laminate: uri,
          laminateLabel: '',
          model: '',
          modelLabel: '',
          start: '',
          end: '',
          datasetCount: 0,
        },
      ],
    })
    const button = wrapper.get('[aria-describedby="laminate-assignment-notice"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.get('#laminate-assignment-notice').text()).toContain('cannot be deleted')
    await button.trigger('click')
    expect(wrapper.find('[aria-label="Confirm deletion"]').exists()).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(wrapper.find('a[href^="/runs/new"]').exists()).toBe(false)
    wrapper.unmount()
  },
)

it('opens and hides the QR preview from the shared action toolbar', async () => {
  vi.mocked(generateLaminateQr).mockResolvedValue({
    svg: 'data:image/svg+xml,test',
    png: 'data:image/png,test',
  })
  const { wrapper } = await render()
  const button = wrapper.get('[aria-label="Laminate actions"] button.secondary')
  expect(button.attributes('aria-expanded')).toBe('false')
  await button.trigger('click')
  await flushPromises()
  expect(generateLaminateQr).toHaveBeenCalledWith(uri)
  expect(button.attributes('aria-expanded')).toBe('true')
  expect(wrapper.find('[aria-label="Laminate QR code"] img').exists()).toBe(true)
  await button.trigger('click')
  expect(wrapper.find('[aria-label="Laminate QR code"]').exists()).toBe(false)
  wrapper.unmount()
})

it('uses the full run count to block deletion even without displayed runs', async () => {
  const { wrapper } = await render('loaded', { items: [], total: 6 })
  expect(
    wrapper.get('[aria-describedby="laminate-assignment-notice"]').attributes('disabled'),
  ).toBeDefined()
  wrapper.unmount()
})

it('deletes an unused laminate only after confirmation and allows cancellation', async () => {
  const remove = vi.spyOn(repository, 'deleteLaminate').mockResolvedValue()
  const { wrapper, router } = await render()
  const button = wrapper.get('[aria-label="Laminate actions"] > button')
  expect(button.text()).toBe('Delete laminate')
  expect(button.attributes('disabled')).toBeUndefined()
  expect(wrapper.find('a[href^="/runs/new"]').exists()).toBe(true)
  await button.trigger('click')
  expect(remove).not.toHaveBeenCalled()
  await wrapper.get('[aria-label="Confirm deletion"] button.secondary').trigger('click')
  expect(wrapper.find('[aria-label="Confirm deletion"]').exists()).toBe(false)
  expect(remove).not.toHaveBeenCalled()
  await button.trigger('click')
  await wrapper.get('[aria-label="Confirm deletion"] button.danger').trigger('click')
  await flushPromises()
  expect(remove).toHaveBeenCalledExactlyOnceWith(uri)
  expect(router.currentRoute.value.path).toBe('/laminates')
  wrapper.unmount()
})

it('shows a repository rejection when the laminate acquires a reference after loading', async () => {
  vi.spyOn(repository, 'deleteLaminate').mockRejectedValue(
    new Error('This laminate is referenced by other records and cannot be deleted.'),
  )
  const { wrapper, router } = await render()
  await wrapper.get('[aria-label="Laminate actions"] > button').trigger('click')
  await wrapper.get('[aria-label="Confirm deletion"] button.danger').trigger('click')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('cannot be deleted')
  expect(router.currentRoute.value.path).toBe('/laminate')
  wrapper.unmount()
})

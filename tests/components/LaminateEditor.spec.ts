// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LaminateEditorView from '../../src/views/LaminateEditorView.vue'
import { repository } from '../../src/services/repository'
import { references } from '../helpers'
import { BASE, Store } from '../../src/domain/rdf'
let refs: Store
beforeAll(async () => {
  refs = await references()
})
afterEach(() => vi.restoreAllMocks())
async function setup(path: string) {
  vi.spyOn(repository, 'getReferenceGraph').mockResolvedValue(refs)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/laminates/new', component: LaminateEditorView },
      { path: '/laminate/edit', component: LaminateEditorView },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(LaminateEditorView, { global: { plugins: [createPinia(), router] } })
  await flushPromises()
  return { wrapper, router }
}
describe('laminate editor', () => {
  it('loads existing dimensions and layers, saves the same identity and refreshes', async () => {
    const uri = BASE + 'laminate/1#it'
    const save = vi.spyOn(repository, 'saveLaminate').mockResolvedValue(uri)
    const { wrapper, router } = await setup('/laminate/edit?uri=' + encodeURIComponent(uri))
    expect(wrapper.findAll('h3')).toHaveLength(14)
    expect((wrapper.get('input[aria-label="Length *"]').element as HTMLInputElement).value).toBe(
      '400.0',
    )
    await wrapper.get('input[aria-label="Laminate name"]').setValue('Edited')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ uri, name: 'Edited' }), refs, true)
    expect(router.currentRoute.value.path).toBe('/laminate')
    expect(repository.getReferenceGraph).toHaveBeenCalledTimes(2)
  })
  it('offers defaults and lets users select an existing laminate as a template', async () => {
    const { wrapper } = await setup('/laminates/new')
    expect((wrapper.get('input[aria-label="Length *"]').element as HTMLInputElement).value).toBe(
      '400',
    )
    expect(wrapper.findAll('h3')).toHaveLength(6)
    await wrapper.get('select[aria-label="Laminate template"]').setValue(BASE + 'laminate/1#it')
    expect(wrapper.findAll('h3')).toHaveLength(14)
    expect(
      (wrapper.get('input[aria-label="Laminate name"]').element as HTMLInputElement).value,
    ).toBe('BASF PA6-GF60 (copy)')
    await wrapper.get('select[aria-label="Laminate template"]').setValue('')
    expect(wrapper.findAll('h3')).toHaveLength(6)
  })
  it('opens a direct copy with a fresh identity and saves it as a new laminate', async () => {
    const sourceUri = BASE + 'laminate/1#it'
    const save = vi.spyOn(repository, 'saveLaminate').mockImplementation(async (draft) => draft.uri)
    const { wrapper, router } = await setup('/laminates/new?copy=' + encodeURIComponent(sourceUri))
    expect(wrapper.findAll('h3')).toHaveLength(14)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'BASF PA6-GF60 (copy)' }),
      refs,
      false,
    )
    const draft = save.mock.calls[0]![0]
    expect(draft.uri).not.toBe(sourceUri)
    expect(draft.identifier).not.toBe('1_1')
    expect(router.currentRoute.value.query.uri).toBe(draft.uri)
  })
  it('reports a missing copy source', async () => {
    const { wrapper } = await setup('/laminates/new?copy=urn:missing')
    expect(wrapper.text()).toContain('Template laminate not found')
    expect(wrapper.find('form').exists()).toBe(false)
  })
  it('retains inputs and shows write errors', async () => {
    vi.spyOn(repository, 'saveLaminate').mockRejectedValue(new Error('Connection failed'))
    const { wrapper, router } = await setup('/laminates/new')
    await wrapper.get('input[aria-label="Laminate name"]').setValue('Retained')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Connection failed')
    expect(
      (wrapper.get('input[aria-label="Laminate name"]').element as HTMLInputElement).value,
    ).toBe('Retained')
    expect(router.currentRoute.value.path).toBe('/laminates/new')
  })
})

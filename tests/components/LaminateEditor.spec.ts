// @vitest-environment jsdom
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import LaminateEditorView from '../../src/views/LaminateEditorView.vue'
import LaminateSummary from '../../src/components/LaminateSummary.vue'
import { useKnowledgeStore } from '../../src/stores/knowledge'
import { repository } from '../../src/services/repository'
import { readStore } from '../helpers'
import { BASE, NS, Store, df, n } from '../../src/domain/rdf'
let refs: Store
beforeAll(async () => {
  refs = await readStore('laminate.ttl')
})
afterEach(() => vi.restoreAllMocks())
async function setup(path: string, graph = refs) {
  vi.spyOn(repository, 'getReferenceGraph').mockResolvedValue(graph)
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
  it('displays saved scientific literals as plain numbers in copies and summaries', async () => {
    // Fuseki canonicalizes saved doubles into scientific notation.
    const graph = new Store(
      [...refs].map((quad) => {
        const term = quad.object
        if (
          term.termType !== 'Literal' ||
          !['integer', 'decimal', 'float', 'double'].some(
            (type) => term.datatype.value === NS.xsd + type,
          )
        )
          return quad
        return df.quad(
          quad.subject,
          quad.predicate,
          df.literal(Number(term.value).toExponential(2), n(NS.xsd + 'double')),
          quad.graph,
        )
      }),
    )
    const uri = BASE + 'laminate/1#it'
    const save = vi.spyOn(repository, 'saveLaminate').mockImplementation(async (draft) => draft.uri)
    const { wrapper } = await setup('/laminates/new?copy=' + encodeURIComponent(uri), graph)
    const input = (label: string) => wrapper.get<HTMLInputElement>(`input[aria-label="${label}"]`)
    expect(input('Width *').element.value).toBe('400')
    expect(input('Thickness *').element.value).toBe('1.56')
    expect(input('Layer 2 orientation *').element.value).toBe('60')
    expect(input('Layer 1 fiber mass fraction *').element.value).toBe('60')
    expect(input('Point 2 Y').element.value).toBe('-100')
    await input('Width *').setValue('450.5')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(save.mock.calls[0]![0].width).toBe('450.5')

    const pinia = createPinia()
    useKnowledgeStore(pinia).references = graph
    const summary = mount(LaminateSummary, {
      props: { uri },
      global: { plugins: [pinia], stubs: { EntityLink: true } },
    })
    expect(summary.get('.fact-strip').text()).toContain('400 mm')
    expect(summary.get('.fact-strip').text()).toContain('1.56 mm')
    expect(summary.text()).toContain('-100 mm')
    expect(summary.text()).not.toMatch(/\d(?:\.\d+)?[eE][+-]?\d/)
    expect([...graph].some((quad) => quad.object.value === '4.00e+2')).toBe(true)
  })
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

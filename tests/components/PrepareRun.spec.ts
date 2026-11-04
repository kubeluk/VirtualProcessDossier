// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import PrepareRunView from '../../src/views/PrepareRunView.vue'
import LaminateEditorView from '../../src/views/LaminateEditorView.vue'
import { repository } from '../../src/services/repository'
import { useKnowledgeStore } from '../../src/stores/knowledge'
import { BASE, NS, Store, merge, n, df } from '../../src/domain/rdf'
import { copySettings, initializationIris } from '../../src/domain/initialization'
import { buildLaminate } from '../../src/domain/laminate'
import { references, initializationSource, sourceRun } from '../helpers'

let refs: Store, source: Store
const usedLaminate = BASE + 'laminate/1#it'
const unusedLaminate = BASE + 'laminate/unused#it'
beforeAll(async () => {
  refs = await references()
  refs.addQuad(n(unusedLaminate), n(NS.rdf + 'type'), n(NS.for + 'Laminate'))
  refs.addQuad(n(unusedLaminate), n(NS.rdfs + 'label'), df.literal('Unused laminate'))
  source = await initializationSource()
})
beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(repository, 'getReferenceGraph').mockResolvedValue(refs)
  vi.spyOn(repository, 'facets').mockResolvedValue([
    { kind: 'run', uri: sourceRun, label: 'Trial No. 1' },
  ])
  vi.spyOn(repository, 'getRunContext').mockResolvedValue(merge(refs, source))
  vi.spyOn(repository, 'usedLaminates').mockResolvedValue([usedLaminate])
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('run preparation lifecycle', () => {
  function restoreDraft(laminate: string, step = 4) {
    const draft = copySettings(merge(refs, source), sourceRun, refs, 'restored-draft')
    draft.name = 'Restored draft'
    draft.laminate = laminate
    draft.laminateConfirmed = true
    sessionStorage.setItem(
      'vpd.initialization.v1',
      JSON.stringify({ draft, step, machine: 'gripping' }),
    )
    return draft
  }
  async function setup(query = '', routed = false) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/runs/new', component: PrepareRunView },
        { path: '/laminates/new', component: LaminateEditorView },
        { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
      ],
    })
    await router.push('/runs/new' + query)
    const wrapper = mount(routed ? { template: '<RouterView />' } : PrepareRunView, {
      global: { plugins: [pinia, router] },
    })
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
  it('disables assigned laminates while retaining copied machine settings and requiring a new laminate', async () => {
    const { wrapper } = await setup('?copy=' + encodeURIComponent(sourceRun))
    expect(wrapper.get(`input[value="${usedLaminate}"]`).attributes('disabled')).toBeDefined()
    expect(wrapper.get(`input[value="${unusedLaminate}"]`).attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).toContain('Already assigned to a run')
    const saved = JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft
    expect(saved.laminate).toBe('')
    expect(saved.grippers[0].x).toBe('210.0')
    await wrapper.get(`input[value="${unusedLaminate}"]`).setValue()
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
  it('blocks a used laminate supplied through a direct URL', async () => {
    const { wrapper } = await setup('?laminate=' + encodeURIComponent(usedLaminate))
    expect(wrapper.text()).toContain('Choose an unused laminate.')
    expect(wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('creates and selects a laminate while retaining the run draft when all laminates are assigned', async () => {
    const draft = restoreDraft(usedLaminate, 2)
    vi.mocked(repository.usedLaminates).mockResolvedValue([usedLaminate, unusedLaminate])
    const save = vi.spyOn(repository, 'saveLaminate').mockImplementation(async (laminate) => {
      vi.mocked(repository.getReferenceGraph).mockResolvedValue(
        merge(refs, buildLaminate(laminate, refs)),
      )
      return laminate.uri
    })
    const { wrapper, router } = await setup('', true)
    expect(wrapper.text()).toContain('No unused laminates are available.')
    await wrapper.get('input[aria-label="Run name"]').setValue('Run with a new laminate')
    await wrapper.get('textarea[aria-label="Run notes"]').setValue('Retain my settings')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Create a new laminate')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/laminates/new')
    expect(router.currentRoute.value.query.runDraft).toBe(draft.id)
    expect(wrapper.text()).toContain('Save & use for run')
    await wrapper.get('input[aria-label="Laminate name"]').setValue('New run input')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    const laminate = save.mock.calls[0]![0]
    expect(router.currentRoute.value.path).toBe('/runs/new')
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.get<HTMLInputElement>(`input[value="${laminate.uri}"]`).element.checked).toBe(
      true,
    )
    expect(wrapper.get<HTMLInputElement>('input[type="checkbox"]').element.checked).toBe(false)
    expect(wrapper.text()).not.toContain('No unused laminates are available.')
    expect(JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft).toEqual({
      ...draft,
      name: 'Run with a new laminate',
      notes: 'Retain my settings',
      laminate: laminate.uri,
      laminateConfirmed: false,
    })
    await wrapper.get('input[type="checkbox"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('nav[aria-label="Machine settings"]').exists()).toBe(true)
    wrapper.unmount()
  })
  it('returns to the retained run draft when laminate creation is cancelled', async () => {
    const draft = restoreDraft(unusedLaminate, 2)
    const save = vi.spyOn(repository, 'saveLaminate')
    const { wrapper, router } = await setup('', true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Create a new laminate')!
      .trigger('click')
    await flushPromises()
    await wrapper
      .findAll('a')
      .find((link) => link.text() === 'Cancel')!
      .trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/runs/new')
    expect(wrapper.find('input[aria-label="Run name"]').exists()).toBe(true)
    expect(JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft).toEqual(draft)
    expect(save).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('retains a failed laminate form and its run draft until the save is retried', async () => {
    const draft = restoreDraft(unusedLaminate, 2)
    vi.spyOn(repository, 'saveLaminate').mockRejectedValue(new Error('Connection failed'))
    const { wrapper, router } = await setup('', true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Create a new laminate')!
      .trigger('click')
    await flushPromises()
    await wrapper.get('input[aria-label="Laminate name"]').setValue('Keep my laminate')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/laminates/new')
    expect(wrapper.get('[role="alert"]').text()).toContain('Connection failed')
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Laminate name"]').element.value).toBe(
      'Keep my laminate',
    )
    expect(JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft).toEqual(draft)
    wrapper.unmount()
  })
  it('does not replace a different retained draft when an outdated return URL is opened', async () => {
    const draft = restoreDraft(unusedLaminate, 2)
    const { wrapper } = await setup(
      '?runDraft=outdated&laminate=' + encodeURIComponent(usedLaminate),
    )
    expect(wrapper.text()).toContain('The run draft could not be restored.')
    expect(JSON.parse(sessionStorage.getItem('vpd.initialization.v1')!).draft).toEqual(draft)
    wrapper.unmount()
  })
  it('blocks a restored review draft whose laminate is already assigned', async () => {
    restoreDraft(usedLaminate)
    const initialize = vi.spyOn(repository, 'initializeRun')
    const { wrapper } = await setup()
    expect(wrapper.text()).toContain('Choose an unused laminate.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(initialize).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('rechecks availability before leaving laminate selection', async () => {
    restoreDraft(unusedLaminate, 2)
    const { wrapper } = await setup()
    vi.mocked(repository.usedLaminates).mockResolvedValue([usedLaminate, unusedLaminate])
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Choose an unused laminate.')
    expect(wrapper.find('input[aria-label="Run name"]').exists()).toBe(true)
    wrapper.unmount()
  })
  it('rechecks availability before saving a restored review draft', async () => {
    restoreDraft(unusedLaminate)
    const initialize = vi.spyOn(repository, 'initializeRun')
    const { wrapper } = await setup()
    vi.mocked(repository.usedLaminates).mockResolvedValue([usedLaminate, unusedLaminate])
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(initialize).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choose an unused laminate.')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('allows an unused laminate to be initialized', async () => {
    const draft = restoreDraft(unusedLaminate)
    const run = initializationIris(draft).run
    const initialize = vi.spyOn(repository, 'initializeRun').mockResolvedValue(run)
    const { wrapper, router } = await setup()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(initialize).toHaveBeenCalledWith(draft, refs)
    expect(router.currentRoute.value.query.uri).toBe(run)
    expect(sessionStorage.getItem('vpd.initialization.v1')).toBeNull()
    wrapper.unmount()
  })
  it('excludes the draft identity so a lost save response can be retried', async () => {
    const draft = restoreDraft(usedLaminate)
    const run = initializationIris(draft).run
    vi.mocked(repository.usedLaminates).mockImplementation(async (excludeRun) =>
      excludeRun === run ? [] : [usedLaminate],
    )
    const { wrapper } = await setup()
    expect(repository.usedLaminates).toHaveBeenCalledWith(run)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
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

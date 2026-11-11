// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import MachineParameters from '../../src/components/MachineParameters.vue'
import { useKnowledgeStore } from '../../src/stores/knowledge'
import { copySettings } from '../../src/domain/initialization'
import { Store, merge } from '../../src/domain/rdf'
import { references, initializationSource, sourceRun } from '../helpers'
let refs: Store, source: Store
beforeAll(async () => {
  refs = await references()
  source = await initializationSource()
})
describe('purpose-built machine forms', () => {
  async function setup(readonly = false) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const knowledge = useKnowledgeStore()
    knowledge.references = refs
    knowledge.loaded = true
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    const draft = copySettings(merge(refs, source), sourceRun, refs)
    const wrapper = mount(MachineParameters, {
      props: { modelValue: draft, readonly },
      global: { plugins: [pinia, router] },
    })
    await router.isReady()
    return { wrapper, draft }
  }
  it('edits a gripper-stage value without changing other stages until explicitly applying to all', async () => {
    const { wrapper, draft } = await setup()
    await wrapper.get('input[aria-label="Gripper 1 heating setpoint"]').setValue('75')
    expect(draft.grippers[0]!.heating).toBe('75')
    expect(draft.grippers[1]!.heating).toBe('60')
    const apply = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Apply gripper 1 heating setpoint to all')!
    await apply.trigger('click')
    expect(draft.grippers.every((g) => g.heating === '75')).toBe(true)
    expect(draft.grippers.every((g) => g.pressing === '60')).toBe(true)
  })
  it('reorders the closing profile and renders recorded settings without editing controls', async () => {
    const { wrapper, draft } = await setup()
    await wrapper.get('button[aria-label="Move step 2 up"]').trigger('click')
    expect(draft.press.steps.map((s) => s.speed)).toEqual(['60.0', '80.0', '35.0', '10.0'])
    const read = await setup(true)
    expect(read.wrapper.findAll('input')).toHaveLength(0)
    expect(read.wrapper.text()).toContain('Threshold temperature')
    expect(read.wrapper.get('.read-value').text()).toBe('210 mm')
    expect(read.wrapper.text()).toContain('260 °C')
    expect(read.wrapper.text()).not.toContain('260.0')
    expect(read.wrapper.findAll('svg')).toHaveLength(2)
  })
  it('edits heater targets under Press and displays them there in read-only settings', async () => {
    const { wrapper, draft } = await setup()
    await wrapper.setProps({ section: 'heating' })
    expect(wrapper.text()).toContain('Infrared oven')
    expect(wrapper.text()).not.toContain('Press heaters')
    expect(wrapper.find('input[aria-label="Heater 1 target"]').exists()).toBe(false)
    await wrapper.setProps({ section: 'pressing' })
    expect(wrapper.text()).toContain('Press heaters')
    expect(wrapper.get<HTMLInputElement>('input[aria-label="Heater 1 target"]').element.value).toBe(
      '300',
    )
    await wrapper.get('input[aria-label="Heater 1 target"]').setValue('305')
    expect(draft.press.devices.map((device) => device.value)).toEqual(['305', '300.0'])
    await wrapper.setProps({ readonly: true })
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.text()).toContain('Heater 1 target')
    expect(wrapper.text()).toContain('305 °C')
  })
})

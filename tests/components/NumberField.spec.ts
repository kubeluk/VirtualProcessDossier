// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NumberField from '../../src/components/NumberField.vue'

describe('numeric input display', () => {
  it('formats values for display while allowing decimal entry without rewriting the model', async () => {
    const wrapper = mount(NumberField, {
      props: {
        modelValue: '400.0',
        label: 'Length',
        unit: 'mm',
        'onUpdate:modelValue': (modelValue: string) => wrapper.setProps({ modelValue }),
      },
    })
    const input = wrapper.get('input')
    expect(input.element.value).toBe('400')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await input.trigger('focus')
    for (const text of ['1.', '1.0', '1.05', '1.0500']) {
      await input.setValue(text)
      expect(input.element.value).toBe(text)
    }
    await input.trigger('blur')
    expect(input.element.value).toBe('1.05')
    expect(wrapper.props('modelValue')).toBe('1.0500')
  })
})

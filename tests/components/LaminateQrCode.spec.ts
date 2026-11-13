// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LaminateQrCode from '../../src/components/LaminateQrCode.vue'
import { generateLaminateQr } from '../../src/utils/laminateQr'

vi.mock('../../src/utils/laminateQr', async (original) => ({
  ...(await original<typeof import('../../src/utils/laminateQr')>()),
  generateLaminateQr: vi.fn(),
}))
afterEach(() => vi.resetAllMocks())
const uri = 'http://purl.org/for/laminate/1#it'
const images = { svg: 'data:image/svg+xml,test', png: 'data:image/png,test' }
const render = () =>
  mount(LaminateQrCode, { props: { uri, name: 'Test laminate', identifier: 'A / 1' } })

describe('laminate QR downloads', () => {
  it('generates on demand and downloads both formats for the exact identity', async () => {
    vi.mocked(generateLaminateQr).mockResolvedValue(images)
    const wrapper = render()
    expect(generateLaminateQr).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(generateLaminateQr).toHaveBeenCalledWith(uri)
    expect(wrapper.get('img').attributes('src')).toBe(images.svg)
    expect(wrapper.text()).toContain(uri)
    expect(
      wrapper.findAll('a').map((a) => [a.attributes('href'), a.attributes('download')]),
    ).toEqual([
      [images.svg, 'laminate-A-1-qr.svg'],
      [images.png, 'laminate-A-1-qr.png'],
    ])
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('section').exists()).toBe(false)
    wrapper.unmount()
  })
  it('disables downloads during generation and allows retry after failure', async () => {
    vi.mocked(generateLaminateQr)
      .mockRejectedValueOnce(new Error('Failure'))
      .mockResolvedValue(images)
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Please retry')
    expect(wrapper.findAll('button[disabled]')).toHaveLength(2)
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Retry')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('a')).toHaveLength(2)
    wrapper.unmount()
  })
  it('discards pending images when the laminate changes', async () => {
    let finish!: (value: typeof images) => void
    vi.mocked(generateLaminateQr).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toContain('Generating')
    expect(wrapper.findAll('button[disabled]')).toHaveLength(2)
    await wrapper.setProps({ uri: 'http://purl.org/for/laminate/2#it' })
    finish(images)
    await flushPromises()
    expect(wrapper.find('section').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })
})

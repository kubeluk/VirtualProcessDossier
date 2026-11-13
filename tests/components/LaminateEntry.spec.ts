// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import router from '../../src/router'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

it.each(['1', 'c6be71ab-8ac3-4d6b-9a2f-123456789abc', 'unknown'])(
  'resolves a direct persistent entry for %s with and without a fragment',
  async (id) => {
    for (const fragment of ['', '#it']) {
      await router.push('/id/laminate/' + id + fragment)
      expect(router.currentRoute.value.name).toBe('laminate')
      expect(router.currentRoute.value.query).toEqual({
        uri: `http://purl.org/for/laminate/${id}#it`,
      })
      expect(router.currentRoute.value.hash).toBe('')
    }
  },
)

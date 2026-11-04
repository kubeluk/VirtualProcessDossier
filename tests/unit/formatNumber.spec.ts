import { describe, expect, it } from 'vitest'
import { formatNumber } from '../../src/utils/formatNumber'

describe('plain numeric display', () => {
  it.each([
    ['400.0e0', '400'],
    ['1.56E+0', '1.56'],
    ['-1.9e2', '-190'],
    ['6.0e1', '60'],
    ['0.0e0', '0'],
    ['1e-7', '0.0000001'],
    ['1e21', '1000000000000000000000'],
    ['1.234567890123456789e-2', '0.01234567890123456789'],
    ['400.0', '400.0'],
    ['', ''],
    ['1e', '1e'],
    ['NaN', 'NaN'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })
})

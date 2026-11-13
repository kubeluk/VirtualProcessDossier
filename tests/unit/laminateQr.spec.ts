import { expect, it } from 'vitest'
import { generateLaminateQr, laminateQrFilename } from '../../src/utils/laminateQr'

it('creates real scalable SVG and large PNG images', async () => {
  const images = await generateLaminateQr('http://purl.org/for/laminate/1#it')
  expect(decodeURIComponent(images.svg)).toContain('<svg')
  expect(decodeURIComponent(images.svg)).toContain('viewBox=')
  const png = Buffer.from(images.png.split(',')[1]!, 'base64')
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(1024)
  expect(png.readUInt32BE(20)).toBe(png.readUInt32BE(16))
})

it('uses safe filenames with a fallback for missing identifiers', () => {
  expect(laminateQrFilename('../A / B')).toBe('laminate-A-B-qr')
  expect(laminateQrFilename('')).toBe('laminate-qr')
  expect(laminateQrFilename('///')).toBe('laminate-qr')
})

export async function generateLaminateQr(uri: string) {
  const { default: QRCode } = await import('qrcode')
  const options = {
    errorCorrectionLevel: 'Q' as const,
    margin: 4,
    color: { dark: '#000000ff', light: '#ffffffff' },
  }
  const modules = QRCode.create(uri, options).modules.size + 8
  const [svg, png] = await Promise.all([
    QRCode.toString(uri, { ...options, type: 'svg' }),
    QRCode.toDataURL(uri, { ...options, scale: Math.ceil(1024 / modules) }),
  ])
  return { svg: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), png }
}

export function laminateQrFilename(identifier: string) {
  const safe = identifier
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safe ? `laminate-${safe}-qr` : 'laminate-qr'
}

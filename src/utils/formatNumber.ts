/** Expand scientific notation for display without rounding the recorded digits. */
export function formatNumber(value: string): string {
  const match = value.match(/^([+-]?)(\d*\.?\d+)[eE]([+-]?\d+)$/)
  if (!match || !Number.isFinite(Number(value))) return value
  const [, sign, mantissa, exponent] = match as [string, string, string, string]
  const digits = mantissa.replace('.', '')
  const point =
    (mantissa.includes('.') ? mantissa.indexOf('.') : mantissa.length) + Number(exponent)
  let decimal: string
  if (point <= 0) decimal = '0.' + '0'.repeat(-point) + digits
  else if (point >= digits.length) decimal = digits + '0'.repeat(point - digits.length)
  else decimal = digits.slice(0, point) + '.' + digits.slice(point)
  decimal = decimal.replace(/^0+(?=\d)/, '')
  if (decimal.includes('.')) decimal = decimal.replace(/0+$/, '').replace(/\.$/, '')
  return (sign === '-' ? '-' : '') + decimal
}

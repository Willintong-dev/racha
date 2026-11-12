/** "4.000" → 4000 · "4.000,5" → 4000.5 · "0,25" → 0.25 · "0.25" → 0.25 */
export function parseLocaleNumber(t: string) {
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.'))
  const parts = t.split('.')
  const thousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0] !== '0'
  return parseFloat(thousands ? parts.join('') : t)
}

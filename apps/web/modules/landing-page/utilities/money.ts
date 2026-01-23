export function fmt(val: number): string {
  if (val === 0) return '0'
  const fixed = val.toFixed(2)
  return fixed.replace('.', ',')
}

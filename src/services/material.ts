import type { SparqlBinding } from '@/services/sparql'

// Reconstruct RDF list order from cells; URI/angle sorting changes the physical stack.
export function orderedStack(rows: SparqlBinding[]): SparqlBinding[] {
  const cells = new Map(rows.map((row) => [row.cell.value, row]))
  if (!cells.size) return []
  const successors = new Set([...cells.values()].map((row) => row.next.value))
  const heads = [...cells.values()].filter((row) => !successors.has(row.cell.value))
  if (heads.length !== 1) throw new Error('The tape stack has no unique first ply.')
  const ordered: SparqlBinding[] = []
  const visited = new Set<string>()
  let row: SparqlBinding | undefined = heads[0]
  while (row && !visited.has(row.cell.value)) {
    visited.add(row.cell.value)
    ordered.push(row)
    if (row.next.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil') break
    row = cells.get(row.next.value)
  }
  if (
    ordered.length !== cells.size ||
    ordered[ordered.length - 1]?.next.value !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'
  ) {
    throw new Error('The tape stack is incomplete or cyclic.')
  }
  return ordered
}

export function groupedStacks(rows: SparqlBinding[], key: string): Map<string, SparqlBinding[]> {
  const groups = new Map<string, SparqlBinding[]>()
  for (const row of rows) {
    const id = row[key].value
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id)!.push(row)
  }
  return new Map([...groups].map(([id, stack]) => [id, orderedStack(stack)]))
}

export function materialResourceId(uri: string): string {
  const url = new URL(uri)
  if (url.hash === '#it') return url.pathname.split('/').pop() ?? uri
  return (url.hash.slice(1) || url.pathname.split('/').pop() || uri).replace(/^needle-point-/, '')
}

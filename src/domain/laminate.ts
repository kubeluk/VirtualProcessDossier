import { BASE, NS, Store, df, n, objects, object, value, list, isType } from './rdf'
import { validatePlans } from './initialization'

export interface LaminateDraft {
  uri: string
  name: string
  identifier: string
  length: string
  width: string
  thickness: string
  layupName: string
  layers: { polymer: string; fiber: string; fraction: string; angle: string }[]
  needles: { x: string; y: string; reference: string }[]
}
export const newLayer = () => ({ polymer: 'PA6', fiber: 'GF', fraction: '60', angle: '0' })
export function newLaminate(): LaminateDraft {
  const id = crypto.randomUUID()
  return {
    uri: BASE + 'laminate/' + id + '#it',
    name: 'BASF PA6-GF60',
    identifier: 'laminate-' + id,
    length: '400',
    width: '400',
    thickness: '1.56',
    layupName: '[0/60/120]s',
    layers: ['0', '60', '120', '120', '60', '0'].map((angle) => ({ ...newLayer(), angle })),
    needles: [],
  }
}
export function readLaminate(g: Store, uri: string): LaminateDraft {
  const layup = object(g, uri, NS.prov + 'wasDerivedFrom')
  const size = (kind: string) =>
    value(
      g,
      objects(g, uri, NS.geo + 'hasSize').find(
        (q) => value(g, q, NS.qudt + 'hasQuantityKind') === NS.kind + kind,
      ),
      NS.qudt + 'value',
    )
  return {
    uri,
    name: value(g, uri, NS.rdfs + 'label'),
    identifier: value(g, uri, NS.dct + 'identifier'),
    length: size('Length'),
    width: size('Width'),
    thickness: size('Thickness'),
    layupName: value(g, layup, NS.rdfs + 'label'),
    layers: list(g, object(g, layup, NS.param + 'tapeStack')).map((tape) => {
      const derivation =
        layup &&
        objects(g, layup, NS.prov + 'qualifiedDerivation').find(
          (d) => value(g, d, NS.prov + 'entity') === tape.value,
        )
      return {
        polymer: value(g, tape, NS.param + 'polymer'),
        fiber: value(g, tape, NS.param + 'fiberType'),
        fraction: value(g, object(g, tape, NS.param + 'hasFiberMassFraction'), NS.qudt + 'value'),
        angle: value(
          g,
          object(g, derivation || undefined, NS.param + 'fiberOrientation'),
          NS.qudt + 'value',
        ),
      }
    }),
    needles: objects(g, uri, NS.param + 'hasNeedlePoint').map((point) => {
      const xy = list(g, object(g, object(g, point, NS.qudt + 'quantityValue'), NS.qudt + 'value'))
      return {
        x: xy[0]?.value ?? '',
        y: xy[1]?.value ?? '',
        reference: value(g, point, NS.param + 'referencePoint'),
      }
    }),
  }
}
/** Copy only editable material data; the saved graph mints independent nested resources. */
export function copyLaminate(g: Store, uri: string): LaminateDraft {
  if (!isType(g, uri, NS.for + 'Laminate')) throw new Error('Template laminate not found.')
  const source = readLaminate(g, uri)
  const fresh = newLaminate()
  return { ...source, uri: fresh.uri, name: source.name + ' (copy)', identifier: fresh.identifier }
}
const numeric = (v: string) => v.trim() !== '' && Number.isFinite(Number(v))
export function laminateErrors(d: LaminateDraft, refs: Store): string[] {
  const errors: string[] = []
  if (!d.name.trim()) errors.push('Enter a laminate name.')
  if (!d.identifier.trim()) errors.push('Enter an identifier.')
  for (const key of ['length', 'width', 'thickness'] as const)
    if (!numeric(d[key]) || Number(d[key]) <= 0) errors.push(`Enter a positive ${key} in mm.`)
  if (!d.layers.length) errors.push('Add at least one tape layer.')
  d.layers.forEach((l, i) => {
    if (!l.polymer.trim() || !l.fiber.trim())
      errors.push(`Layer ${i + 1}: enter polymer and fiber type.`)
    if (!numeric(l.fraction) || Number(l.fraction) < 0 || Number(l.fraction) > 100)
      errors.push(`Layer ${i + 1}: fiber mass fraction must be between 0 and 100%.`)
    if (!numeric(l.angle)) errors.push(`Layer ${i + 1}: enter a numeric orientation in degrees.`)
  })
  if (d.needles.length > 12) errors.push('Use at most 12 needle points.')
  d.needles.forEach((p, i) => {
    if (!numeric(p.x) || !numeric(p.y))
      errors.push(`Needle point ${i + 1}: enter numeric X and Y coordinates.`)
    if (!isType(refs, p.reference, NS.for + 'ReferencePoint'))
      errors.push(`Needle point ${i + 1}: select a reference point.`)
  })
  return errors
}
export function buildLaminate(d: LaminateDraft, refs: Store): Store {
  const errors = laminateErrors(d, refs)
  if (errors.length) throw new Error(errors.join('\n'))
  const g = new Store(),
    root = n(d.uri)
  // All owned resources keep stable fragments under the laminate's identity.
  const base = d.uri.split('#')[0] + '#'
  const add = (
    s: ReturnType<typeof n>,
    p: string,
    o: ReturnType<typeof n> | ReturnType<typeof df.literal>,
  ) => g.addQuad(s, n(p), o)
  const type = (s: ReturnType<typeof n>, t: string) => add(s, NS.rdf + 'type', n(t))
  const number = (v: string) => df.literal(String(Number(v)), n(NS.xsd + 'double'))
  const orderedList = (
    id: string,
    items: (ReturnType<typeof n> | ReturnType<typeof df.literal>)[],
  ) => {
    let tail = n(NS.rdf + 'nil')
    for (let i = items.length - 1; i >= 0; i--) {
      const cell = n(base + id + '-list-' + i)
      add(cell, NS.rdf + 'first', items[i]!)
      add(cell, NS.rdf + 'rest', tail)
      tail = cell
    }
    return tail
  }
  const quantity = (
    id: string,
    kind: string,
    unit: string,
    v: string,
    cls = NS.qudt + 'Quantity',
  ) => {
    const q = n(base + id)
    type(q, cls)
    add(q, NS.qudt + 'hasQuantityKind', n(NS.kind + kind))
    add(q, NS.qudt + 'hasUnit', n(NS.unit + unit))
    add(q, NS.qudt + 'value', number(v))
    return q
  }
  type(root, NS.for + 'Laminate')
  add(root, NS.rdfs + 'label', df.literal(d.name.trim()))
  add(root, NS.dct + 'identifier', df.literal(d.identifier.trim()))
  for (const [key, kind] of [
    ['length', 'Length'],
    ['width', 'Width'],
    ['thickness', 'Thickness'],
  ] as const)
    add(root, NS.geo + 'hasSize', quantity(key, kind, 'MilliM', d[key]))
  const layup = n(base + 'layup')
  type(layup, NS.for + 'Layup')
  add(root, NS.prov + 'wasDerivedFrom', layup)
  if (d.layupName.trim()) add(layup, NS.rdfs + 'label', df.literal(d.layupName.trim()))
  const tapes = d.layers.map((l, i) => {
    const tape = n(base + 'tape-' + i),
      derivation = n(base + 'derivation-' + i)
    type(tape, NS.for + 'Tape')
    add(tape, NS.param + 'polymer', df.literal(l.polymer.trim()))
    add(tape, NS.param + 'fiberType', df.literal(l.fiber.trim()))
    add(
      tape,
      NS.param + 'hasFiberMassFraction',
      quantity(
        'fraction-' + i,
        'MassFraction',
        'PERCENT',
        l.fraction,
        NS.for + 'FiberMassFraction',
      ),
    )
    add(layup, NS.prov + 'wasDerivedFrom', tape)
    add(layup, NS.prov + 'qualifiedDerivation', derivation)
    type(derivation, NS.prov + 'Derivation')
    add(derivation, NS.prov + 'entity', tape)
    add(
      derivation,
      NS.param + 'fiberOrientation',
      quantity('angle-' + i, 'PlaneAngle', 'DEG', l.angle, NS.for + 'FiberOrientation'),
    )
    return tape
  })
  add(layup, NS.param + 'tapeStack', orderedList('tape-stack', tapes))
  d.needles.forEach((p, i) => {
    const point = n(base + 'needle-' + i),
      q = n(base + 'position-' + i)
    add(root, NS.param + 'hasNeedlePoint', point)
    type(point, NS.for + 'NeedlePoint')
    add(point, NS.qudt + 'hasQuantityKind', n(NS.kind + 'PositionVector'))
    add(point, NS.param + 'referencePoint', n(p.reference))
    add(point, NS.qudt + 'quantityValue', q)
    type(q, NS.qudt + 'Quantity')
    add(q, NS.qudt + 'hasUnit', n(NS.unit + 'MilliM'))
    add(q, NS.qudt + 'value', orderedList('position-' + i, [number(p.x), number(p.y)]))
  })
  return g
}
export async function validateLaminate(d: LaminateDraft, refs: Store) {
  const g = buildLaminate(d, refs)
  const data = new Store([
    ...g,
    ...refs.getQuads(null, n(NS.rdf + 'type'), n(NS.for + 'ReferencePoint'), null),
  ])
  const errors = await validatePlans(data, refs, [{ plan: d.uri, shape: NS.for + 'Laminate' }])
  if (errors.length)
    throw new Error(
      'The laminate does not satisfy its SHACL shape. Check its dimensions, layup, and needle points.',
    )
  return g
}

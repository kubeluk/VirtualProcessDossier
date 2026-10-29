// The material-example.ttl vocabulary intentionally differs from the legacy material store.
export const LAMINATE_PREFIXES = `
PREFIX for: <http://purl.org/for/terms#>
PREFIX param: <http://purl.org/for/parameter#>
PREFIX qudt: <http://qudt.org/schema/qudt/>
PREFIX quantitykind: <http://qudt.org/vocab/quantitykind/>
PREFIX unit: <http://qudt.org/vocab/unit/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`

export interface LaminateForm {
  label: string
  identifier: string
  length: number | null
  width: number | null
  thickness: number | null
  layupLabel: string
  plies: { polymer: string; fiberType: string; massFraction: number; orientation: number }[]
  points: { x: number; y: number; referenceUri?: string; referenceLabel: string }[]
}

export function iri(uri: string): string {
  if (!/^https?:\/\/[^\s<>"{}|^`\\]+$/.test(uri)) throw new Error('Invalid resource URI.')
  return `<${uri}>`
}

const literal = (value: string) => JSON.stringify(value)
const numeric = (value: number | null) => `"${value}"^^xsd:double`

export function validateLaminate(form: LaminateForm): void {
  if (!form.label.trim() || !form.identifier.trim())
    throw new Error('Name and identifier are required.')
  if (
    ![form.length, form.width, form.thickness].every(
      (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
    )
  ) {
    throw new Error('Length, width, and thickness must be positive numbers.')
  }
  if (!form.plies.length) throw new Error('Add at least one ply.')
  for (const ply of form.plies) {
    if (!ply.polymer.trim() || !ply.fiberType.trim())
      throw new Error('Each ply needs a polymer and fiber type.')
    if (!Number.isFinite(ply.massFraction) || ply.massFraction < 0 || ply.massFraction > 100) {
      throw new Error('Fiber mass fraction must be between 0 and 100%.')
    }
    if (!Number.isFinite(ply.orientation)) throw new Error('Each orientation must be a number.')
  }
  if (form.points.length > 12) throw new Error('A laminate can have at most 12 needle points.')
  if (form.points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Needle point coordinates must be numbers.')
  }
}

export function laminateTriples(uri: string, form: LaminateForm, revision: string): string {
  validateLaminate(form)
  const root = iri(uri)
  const resource = (name: string) => iri(`http://purl.org/for/data/laminate/${revision}#${name}`)
  const layup = resource('layup')
  const tapes = form.plies.map((_, i) =>
    iri(`http://purl.org/for/data/tape/${revision}-${i + 1}#it`),
  )
  const triples = [
    `${root} a for:Laminate ; rdfs:label ${literal(form.label.trim())} ;
    dcterms:identifier ${literal(form.identifier.trim())} ; prov:wasDerivedFrom ${layup} .`,
  ]
  for (const [kind, value] of [
    ['Length', form.length],
    ['Width', form.width],
    ['Thickness', form.thickness],
  ] as const) {
    triples.push(
      `${root} geo:hasSize [ a qudt:Quantity ; qudt:hasQuantityKind quantitykind:${kind} ; qudt:hasUnit unit:MilliM ; qudt:value ${numeric(value)} ] .`,
    )
  }
  triples.push(
    `${layup} a for:Layup ; rdfs:label ${literal(form.layupLabel)} ; param:tapeStack ( ${tapes.join(' ')} ) .`,
  )
  form.plies.forEach((ply, i) => {
    triples.push(`${layup} prov:wasDerivedFrom ${tapes[i]} ; prov:qualifiedDerivation [ a prov:Derivation ; prov:entity ${tapes[i]} ; param:fiberOrientation [ a for:FiberOrientation ; qudt:hasQuantityKind quantitykind:PlaneAngle ; qudt:hasUnit unit:DEG ; qudt:value ${numeric(ply.orientation)} ] ] .
    ${tapes[i]} a for:Tape ; param:polymer ${literal(ply.polymer.trim())} ; param:fiberType ${literal(ply.fiberType.trim())} ; param:hasFiberMassFraction [ a for:FiberMassFraction ; qudt:hasQuantityKind quantitykind:MassFraction ; qudt:hasUnit unit:PERCENT ; qudt:value ${numeric(ply.massFraction)} ] .`)
  })
  form.points.forEach((point, i) => {
    const reference = point.referenceUri ? iri(point.referenceUri) : resource('origin')
    triples.push(`${reference} a for:ReferencePoint .`)
    if (!point.referenceUri)
      triples.push(
        `${reference} rdfs:label ${literal(point.referenceLabel || 'Laminate Reference Point')} .`,
      )
    triples.push(`${root} param:hasNeedlePoint ${resource(`needle-point-${i + 1}`)} .
    ${resource(`needle-point-${i + 1}`)} a for:NeedlePoint ; qudt:hasQuantityKind quantitykind:PositionVector ; param:referencePoint ${reference} ; qudt:quantityValue [ a qudt:Quantity ; qudt:hasUnit unit:MilliM ; qudt:value ( ${numeric(point.x)} ${numeric(point.y)} ) ] .`)
  })
  return triples.join('\n')
}

// Traverse only material structure; never rdf:type, units, or quantity-kind vocabularies.
const STRUCTURE =
  '(prov:wasDerivedFrom|geo:hasSize|param:hasNeedlePoint|param:referencePoint|qudt:quantityValue|qudt:value|param:tapeStack|rdf:rest|rdf:first|prov:qualifiedDerivation|param:fiberOrientation|param:hasFiberMassFraction)'

export function laminateDelete(uri: string, retainedReferences: string[] = []): string {
  const root = iri(uri)
  return `DELETE { ?node ?predicate ?object } WHERE {
    ${root} a for:Laminate ; ${STRUCTURE}* ?node .
    FILTER(isIRI(?node) || isBlank(?node))
    FILTER(?node != rdf:nil)
    ${retainedReferences.length ? `FILTER(?node NOT IN (${retainedReferences.map(iri).join(', ')}))` : ''}
    ?node ?predicate ?object .
    # Preserve shared resources and their descendants, including externally used tapes.
    FILTER NOT EXISTS {
      ${root} ${STRUCTURE}* ?ancestor .
      FILTER(?ancestor != ${root} && ?ancestor != rdf:nil)
      ?ancestor ${STRUCTURE}* ?node .
      ?external ?incoming ?ancestor .
      FILTER NOT EXISTS { ${root} ${STRUCTURE}* ?external }
    }
  }`
}

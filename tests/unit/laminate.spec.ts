import { beforeAll, describe, expect, it } from 'vitest'
import { references } from '../helpers'
import { BASE, NS, Store, n, df, objects, typed, value } from '../../src/domain/rdf'
import {
  newLaminate,
  copyLaminate,
  readLaminate,
  laminateErrors,
  validateLaminate,
} from '../../src/domain/laminate'
let refs: Store
beforeAll(async () => {
  refs = await references()
})
describe('laminate editing and shapes', () => {
  it('provides valid example defaults and independent editable copies', async () => {
    const defaults = newLaminate()
    expect(defaults).toMatchObject({
      length: '400',
      width: '400',
      thickness: '1.56',
      layupName: '[0/60/120]s',
    })
    expect(defaults.layers.map((l) => l.angle)).toEqual(['0', '60', '120', '120', '60', '0'])
    await expect(validateLaminate(defaults, refs)).resolves.toBeInstanceOf(Store)
    const sourceUri = BASE + 'laminate/1#it'
    const source = readLaminate(refs, sourceUri)
    const copy = copyLaminate(refs, sourceUri)
    expect(copy).toEqual({
      ...source,
      uri: copy.uri,
      identifier: copy.identifier,
      name: source.name + ' (copy)',
    })
    expect(copy.uri).not.toBe(source.uri)
    expect(copy.identifier).not.toBe(source.identifier)
    const another = copyLaminate(refs, sourceUri)
    expect(another.uri).not.toBe(copy.uri)
    expect(another.identifier).not.toBe(copy.identifier)
    copy.layers[0]!.polymer = 'Changed'
    copy.needles[0]!.x = '0'
    expect(readLaminate(refs, sourceUri)).toEqual(source)
    await expect(validateLaminate(another, refs)).resolves.toBeInstanceOf(Store)
    expect(() => copyLaminate(refs, 'urn:missing')).toThrow('Template laminate not found')
  })
  it('round trips the supplied example through a separate, SHACL-valid layup', async () => {
    const draft = readLaminate(refs, BASE + 'laminate/1#it')
    expect(draft.layers.map((l) => l.angle)).toEqual(['0', '60', '120', '120', '60', '0'])
    expect(draft.needles).toHaveLength(8)
    const graph = await validateLaminate(draft, refs)
    const saved = readLaminate(graph, draft.uri)
    expect(saved).toEqual({
      ...draft,
      length: String(Number(draft.length)),
      width: String(Number(draft.width)),
      needles: draft.needles.map((p) => ({ ...p, x: String(Number(p.x)), y: String(Number(p.y)) })),
    })
    expect(typed(graph, NS.for + 'Tape')).toHaveLength(6)
    expect([...graph].every((q) => q.subject.termType !== 'BlankNode')).toBe(true)
    expect(objects(graph, draft.uri, NS.prov + 'wasDerivedFrom')[0]?.value).not.toBe(
      BASE + 'laminate/1#layup',
    )
  })
  it('supports a minimal laminate without needle points', async () => {
    const draft = {
      ...newLaminate(),
      name: 'Test',
      identifier: 'T1',
      length: '1',
      width: '2',
      thickness: '0.1',
      layers: [{ polymer: 'PA6', fiber: 'GF', fraction: '0', angle: '-45' }],
    }
    const graph = await validateLaminate(draft, refs)
    expect(value(graph, draft.uri, NS.rdfs + 'label')).toBe('Test')
    expect(objects(graph, draft.uri, NS.param + 'hasNeedlePoint')).toHaveLength(0)
  })
  it('rejects missing fields, nonfinite values, invalid ranges and reference points', () => {
    const d = readLaminate(refs, BASE + 'laminate/1#it')
    d.name = ''
    d.identifier = ''
    d.width = '0'
    d.thickness = 'Infinity'
    d.layers[0]!.fraction = '101'
    d.layers[1]!.angle = ''
    d.layers[2]!.polymer = ''
    d.needles = Array.from({ length: 13 }, () => ({ x: 'NaN', y: '', reference: 'urn:missing' }))
    expect(laminateErrors(d, refs).join(' ')).toMatch(
      /name.*identifier.*width.*thickness.*fraction.*orientation.*polymer.*12 needle.*coordinates.*reference/,
    )
  })
  it('runs SHACL validation in addition to input checks', async () => {
    const d = readLaminate(refs, BASE + 'laminate/1#it')
    const stricter = new Store([...refs])
    const shape = df.blankNode()
    stricter.addQuad(n(NS.for + 'Laminate'), n(NS.sh + 'property'), shape)
    stricter.addQuad(shape, n(NS.sh + 'path'), n('urn:required'))
    stricter.addQuad(shape, n(NS.sh + 'minCount'), df.literal('1', n(NS.xsd + 'integer')))
    await expect(validateLaminate(d, stricter)).rejects.toThrow('SHACL')
  })
})

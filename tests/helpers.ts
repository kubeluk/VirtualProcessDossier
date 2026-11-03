import { readFile } from 'node:fs/promises'
import canonize from 'rdf-canonize'
import { BASE, NS, Store, df, n, parse, merge, serialize, value } from '../src/domain/rdf'
import { runActivities } from '../src/domain/model'
import { initializationIris } from '../src/domain/initialization'
import type { InitializationDraft } from '../src/domain/types'

export const sourceRun = BASE + 'workflow/instance/1#it'
export const readStore = async (file: string) =>
  parse(await readFile(new URL('../data/' + file, import.meta.url), 'utf8'))
export async function references() {
  return merge(
    ...(await Promise.all(
      ['workflow.ttl', 'system.ttl', 'properties.ttl', 'laminate.ttl', 'parameter.ttl'].map(
        readStore,
      ),
    )),
  )
}
export async function initializationSource() {
  return merge(await readStore('run-view-after-ui.ttl'), await readStore('plan.ttl'))
}
// The trusted fixtures contain many repeated quantity structures.
export const canonical = (g: Store) =>
  canonize.canonize(serialize(g), {
    algorithm: 'RDFC-1.0',
    inputFormat: 'application/n-quads',
    maxDeepIterations: 100000,
  })
/** Independent oracle: remap the supplied snapshot's named identities to those minted by the UI. */
export function expectedInitialization(
  source: Store,
  actual: Store,
  draft: InitializationDraft,
): Store {
  const ids = initializationIris(draft),
    substitutions = new Map([[sourceRun, ids.run]])
  for (const old of runActivities(source, sourceRun)) {
    const model = value(source, old, NS.wild + 'activityInstanceOf')
    const replacement = runActivities(actual, ids.run).find(
      (t) => value(actual, t, NS.wild + 'activityInstanceOf') === model,
    )
    if (!replacement) throw new Error('Missing expected activity: ' + model)
    substitutions.set(old.value, replacement.value)
  }
  for (const stage of ['gripping', 'heating', 'pressing'])
    substitutions.set(BASE + 'plan/1#' + stage, ids.plan(stage))
  const remap = (term: Parameters<typeof df.quad>[2]) =>
    term.termType === 'NamedNode' && substitutions.has(term.value)
      ? n(substitutions.get(term.value)!)
      : term
  const expected = new Store(
    source
      .getQuads(null, null, null, null)
      .map((q) =>
        df.quad(
          remap(q.subject) as typeof q.subject,
          q.predicate,
          remap(q.object) as typeof q.object,
          q.graph,
        ),
      ),
  )
  const run = n(ids.run)
  expected.removeQuads(expected.getQuads(run, n(NS.rdfs + 'label'), null, null))
  expected.removeQuads(expected.getQuads(run, n(NS.rdfs + 'comment'), null, null))
  expected.addQuad(run, n(NS.rdfs + 'label'), df.literal(draft.name.trim()))
  if (draft.notes.trim())
    expected.addQuad(run, n(NS.rdfs + 'comment'), df.literal(draft.notes.trim()))
  return expected
}

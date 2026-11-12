import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { BASE, NS, Store, df, n, parse, serialize, typed, value } from '../src/domain/rdf'
import { SHAPES, planStages, validatePlans } from '../src/domain/initialization'
import { buildLaminate, readLaminate } from '../src/domain/laminate'
import { runLaminate, runActivities } from '../src/domain/model'

const readyLaminate = BASE + 'laminate/demo-initialized#it'

export const seedFiles = [
  'workflow.ttl',
  'system.ttl',
  'properties.ttl',
  'laminate.ttl',
  'parameter.ttl',
  'plan.ttl',
  'catalog.ttl',
  'run-view-after-demo.ttl',
]
const read = async (file: string) =>
  parse(await readFile(new URL('../data/' + file, import.meta.url), 'utf8'))

export function remapReadyGraph(graph: Store): Store {
  const remap = (term: ReturnType<typeof n>) => {
    if (term.termType !== 'NamedNode') return term
    const iri = term.value
      .replace(BASE + 'workflow/instance/1#', BASE + 'workflow/instance/demo-initialized#')
      .replace(BASE + 'plan/1#', BASE + 'plan/demo-initialized#')
      .replace(BASE + 'laminate/1#it', readyLaminate)
    return n(iri)
  }
  const ready = new Store(
    graph
      .getQuads(null, null, null, null)
      .map((q) =>
        df.quad(
          remap(q.subject as ReturnType<typeof n>),
          q.predicate,
          remap(q.object as ReturnType<typeof n>),
          q.graph,
        ),
      ),
  )
  const run = n(BASE + 'workflow/instance/demo-initialized#it')
  ready.removeQuads(ready.getQuads(run, n(NS.rdfs + 'label'), null, null))
  ready.addQuad(run, n(NS.rdfs + 'label'), df.literal('Example ready run'))
  return ready
}
export async function buildSeedGraph(publicBaseUrl = 'http://localhost:8080'): Promise<Store> {
  const graph = new Store()
  for (const file of seedFiles) graph.addQuads((await read(file)).getQuads(null, null, null, null))
  graph.addQuads([
    ...buildLaminate(
      {
        ...readLaminate(graph, BASE + 'laminate/1#it'),
        uri: readyLaminate,
        name: 'BASF PA6-GF60 (initialized example)',
        identifier: 'demo-initialized',
      },
      graph,
    ),
  ])
  const source = new Store([...(await read('run-view-after-ui.ttl')), ...(await read('plan.ttl'))])
  for (const activity of runActivities(source, BASE + 'workflow/instance/1#it')) {
    const model = value(source, activity, NS.wild + 'activityInstanceOf')
    if (graph.countQuads(n(model), n(NS.rdf + 'type'), n(NS.wild + 'AtomicActivity'), null))
      source.removeQuads(source.getQuads(activity, null, null, null))
  }
  source.removeQuads(source.getQuads(null, n(NS.for + 'initialized'), null, null))
  graph.addQuads(remapReadyGraph(source).getQuads(null, null, null, null))
  const supplemental = await read('demo/connected-datasets.ttl')
  for (const q of supplemental) {
    const object =
      q.object.termType === 'NamedNode' &&
      q.object.value.startsWith('http://localhost:8080/example-data/')
        ? n(
            publicBaseUrl.replace(/\/$/, '') +
              '/example-data/' +
              q.object.value.split('/example-data/')[1],
          )
        : q.object
    graph.addQuad(q.subject, q.predicate, object)
  }
  return graph
}
export async function validateSeedGraph(graph: Store): Promise<void> {
  const plans = typed(graph, NS.prov + 'Plan').map((plan) => {
    const stages = planStages(graph, plan)
    if (stages.length !== 1)
      throw new Error('No unique equipment shape found for plan ' + plan.value)
    const model = stages[0]!
    return { plan, shape: SHAPES[model] }
  })
  const errors = await validatePlans(graph, graph, plans)
  const { default: Validator } = await import('shacl-engine/Validator.js')
  const { validations, targetResolvers } = await import('shacl-engine/sparql.js')
  const validator = new Validator(graph, {
    factory: { ...df, dataset: () => new Store() },
    validations,
    targetResolvers,
  })
  const materials = await validator.validate({ dataset: graph })
  if (!materials.conforms) errors.push('The material examples do not satisfy the supplied shapes.')
  const assignedLaminates = new Set<string>()
  for (const run of typed(graph, NS.wild + 'WorkflowInstance')) {
    if (graph.getObjects(run, n(NS.wild + 'hasState'), null).length !== 1)
      errors.push('A seed run has conflicting states.')
    const laminate = runLaminate(graph, run.value)
    if (laminate) {
      if (assignedLaminates.has(laminate))
        errors.push('A seed laminate is assigned to more than one workflow instance.')
      assignedLaminates.add(laminate)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
}
export async function seed(
  options: {
    url?: string
    dataset?: string
    password?: string
    publicBaseUrl?: string
    fetcher?: typeof fetch
  } = {},
) {
  const request = options.fetcher ?? fetch
  const url = (options.url ?? process.env.FUSEKI_URL ?? 'http://localhost:3030').replace(/\/$/, '')
  const dataset = options.dataset ?? process.env.FUSEKI_DATASET ?? 'vpd'
  if (!/^[a-zA-Z0-9_-]+$/.test(dataset)) throw new Error('Invalid dataset name.')
  const headers = {
    Authorization:
      'Basic ' +
      Buffer.from('admin:' + (options.password ?? process.env.ADMIN_PASSWORD ?? 'admin')).toString(
        'base64',
      ),
  }
  let ready = false
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const response = await request(url + '/$/ping', {
        headers,
        signal: AbortSignal.timeout(2000),
      })
      if (response.status === 401 || response.status === 403)
        throw new Error('Fuseki authentication failed.')
      if (response.ok) {
        ready = true
        break
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('authentication')) throw e
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Fuseki did not become ready within the startup timeout.')
  const status = await request(url + '/$/datasets/' + dataset, { headers })
  if (status.status === 404) {
    const response = await request(url + '/$/datasets', {
      method: 'POST',
      headers,
      body: new URLSearchParams({ dbName: dataset, dbType: 'tdb2' }),
    })
    if (!response.ok) throw new Error('Could not create Fuseki dataset: ' + response.status)
  } else if (!status.ok) throw new Error('Could not inspect Fuseki dataset: ' + status.status)
  const existing = await request(url + '/' + dataset + '/sparql', {
    method: 'POST',
    headers: { ...headers, Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query: 'ASK { ?s ?p ?o }' }),
  })
  if (!existing.ok) throw new Error('Could not inspect existing graph.')
  if (((await existing.json()) as { boolean: boolean }).boolean) {
    console.log('Dataset ' + dataset + ' contains data; preserving it without seeding.')
    return { seeded: false, triples: 0 }
  }
  const graph = await buildSeedGraph(options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL)
  await validateSeedGraph(graph)
  const response = await request(url + '/' + dataset + '/data?default', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'text/turtle' },
    body: serialize(graph),
  })
  if (!response.ok) throw new Error('Seed upload failed: ' + response.status)
  console.log(
    'Seeded ' +
      dataset +
      ' with ' +
      graph.size +
      ' triples, two separate run examples, and connected synthetic datasets.',
  )
  return { seeded: true, triples: graph.size }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  seed().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}

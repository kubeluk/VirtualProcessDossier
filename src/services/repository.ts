import { validateLaminate, type LaminateDraft } from '../domain/laminate'
import {
  NS,
  BASE,
  Store,
  prefixes,
  parse,
  serialize,
  safeIri,
  textLiteral,
  compact,
  merge,
  label,
  value,
} from '../domain/rdf'
import {
  initializationIris,
  validateInitialization,
  copySettings,
  settingsFingerprint,
} from '../domain/initialization'
import type {
  DatasetSummary,
  Filters,
  InitializationDraft,
  Page,
  RunSummary,
} from '../domain/types'

const LAMINATE_PATH =
  '(geo:hasSize|param:hasNeedlePoint|qudt:quantityValue|qudt:value|rdf:first|rdf:rest|prov:wasDerivedFrom|param:tapeStack|prov:qualifiedDerivation|prov:entity|param:fiberOrientation|param:hasFiberMassFraction)'

interface Binding {
  [key: string]: { value: string; type: string }
}
export const LAMINATE_IN_USE_MESSAGE =
  'This laminate has already been used to initialize another run. Choose an unused laminate.'

export class KnowledgeRepository {
  constructor(
    readonly queryEndpoint = '/sparql',
    readonly updateEndpoint = '/update',
    private fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}
  private async request(body: URLSearchParams, accept: string, update = false) {
    const response = await this.fetcher(update ? this.updateEndpoint : this.queryEndpoint, {
      method: 'POST',
      headers: { Accept: accept, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok)
      throw new Error(
        'The knowledge graph request failed (' +
          response.status +
          '). Check the connection and try again.',
      )
    return response
  }
  async select(query: string): Promise<Binding[]> {
    const response = await this.request(
      new URLSearchParams({ query: prefixes + '\n' + query }),
      'application/sparql-results+json',
    )
    return ((await response.json()) as { results: { bindings: Binding[] } }).results.bindings
  }
  async construct(query: string): Promise<Store> {
    const response = await this.request(
      new URLSearchParams({ query: prefixes + '\n' + query }),
      'text/turtle',
    )
    return parse(await response.text())
  }
  async ask(query: string): Promise<boolean> {
    const response = await this.request(
      new URLSearchParams({ query: prefixes + '\n' + query }),
      'application/sparql-results+json',
    )
    return ((await response.json()) as { boolean: boolean }).boolean
  }
  async update(update: string): Promise<void> {
    await this.request(
      new URLSearchParams({ update: prefixes + '\n' + update }),
      'application/json',
      true,
    )
  }
  async getReferenceGraph(): Promise<Store> {
    return this.construct(`CONSTRUCT { ?s ?p ?o } WHERE {
      { ?root a ?type .
      VALUES ?type { sh:NodeShape wild:WorkflowModel wild:AtomicActivity wild:SequentialActivity wild:ParallelActivity
        ssn:System sosa:Sensor sosa:Actuator for:Laminate for:Layup for:Tape for:NeedlePoint for:ReferencePoint sosa:ObservableProperty }
      ?root (!<urn:vpd:unused>)* ?s .
      FILTER(?s = ?root || isBlank(?s))
      ?s ?p ?o . }
      UNION {
        ?laminate a for:Laminate .
        ?laminate ${LAMINATE_PATH}* ?s . ?s ?p ?o .
      }
    }`)
  }
  async getRunContext(uri: string): Promise<Store> {
    const run = safeIri(uri)
    return this.construct(`CONSTRUCT { ?s ?p ?o } WHERE {
      { BIND(${run} AS ?root) }
      UNION { ?root wild:inWorkflowInstance ${run} . }
      UNION { ${run} for:workflowInitialization/for:parameterization/prov:hadMember ?root . }
      UNION { ?activity wild:inWorkflowInstance ${run} ; for:initialization ?root . }
      UNION { ?activity wild:inWorkflowInstance ${run} ; prov:qualifiedAssociation ?root . }
      UNION { ?activity wild:inWorkflowInstance ${run} ; prov:qualifiedAssociation/prov:hadPlan ?root . }
      UNION { ?observation wild:inWorkflowInstance ${run} . ?root prov:wasGeneratedBy ?observation . }
      ?root (!<urn:vpd:unused>)* ?s .
      FILTER(?s = ?root || isBlank(?s))
      ?s ?p ?o .
    }`)
  }
  async getEntityMetadata(uri: string, incomingPage = 0): Promise<Store> {
    const entity = safeIri(uri)
    return this
      .construct(`CONSTRUCT { ?s ?p ?o . ?related ?incoming ${entity} . ?related rdfs:label ?label . ?related dct:title ?title }
      WHERE {
        { ${entity} (!<urn:vpd:unused>)* ?s . FILTER(?s = ${entity} || isBlank(?s)) ?s ?p ?o }
        UNION {
          { BIND(${entity} AS ?quantity) }
          UNION {
            ${entity} (!<urn:vpd:unused>)* ?owner . FILTER(?owner = ${entity} || isBlank(?owner))
            ?owner ?property ?quantity .
          }
          ?quantity qudt:value ?value .
          ?quantity (qudt:value|rdf:rest)* ?s . ?s ?p ?o
        }
        UNION { { SELECT ?related ?incoming WHERE { ?related ?incoming ${entity} } ORDER BY STR(?related) STR(?incoming) LIMIT 50 OFFSET ${Math.max(0, incomingPage) * 50} }
          OPTIONAL { ?related rdfs:label ?label } OPTIONAL { ?related dct:title ?title }
        }
      }`)
  }
  async getDatasetContext(uri: string): Promise<Store> {
    const dataset = safeIri(uri)
    // Load the run in the same response to retain a single identity for each blank node.
    return this.construct(`CONSTRUCT { ?s ?p ?o } WHERE {
      { BIND(${dataset} AS ?root) }
      UNION { ${dataset} prov:wasGeneratedBy ?root }
      UNION { ${dataset} prov:wasGeneratedBy/wild:inWorkflowInstance ?root }
      ?root (!<urn:vpd:unused>)* ?s . FILTER(?s = ?root || isBlank(?s)) ?s ?p ?o
    }`)
  }
  async listRuns(filters: Filters = {}, pageSize = 12): Promise<Page<RunSummary>> {
    const size = Math.max(1, Math.min(100, pageSize))
    const constraints: string[] = []
    for (const [key, variable] of [
      ['state', 'state'],
      ['laminate', 'laminate'],
      ['model', 'model'],
    ] as const)
      if (filters[key]) constraints.push(`FILTER(?${variable} = ${safeIri(filters[key])})`)
    if (filters.search)
      constraints.push(
        `FILTER(CONTAINS(LCASE(CONCAT(STR(COALESCE(?label, "")), " ", STR(COALESCE(?notes, "")))), LCASE(${textLiteral(filters.search)})))`,
      )
    if (filters.from)
      constraints.push(
        `FILTER(?start >= ${textLiteral(filters.from + 'T00:00:00Z')}^^xsd:dateTime)`,
      )
    if (filters.to)
      constraints.push(
        `FILTER(?start < ${textLiteral(new Date(Date.parse(filters.to + 'T00:00:00Z') + 86400000).toISOString())}^^xsd:dateTime)`,
      )
    const where = `?uri a wild:WorkflowInstance .
      OPTIONAL { ?uri rdfs:label ?label } OPTIONAL { ?uri rdfs:comment ?notes }
      OPTIONAL { ?uri wild:hasState ?state }
      OPTIONAL { ?uri wild:workflowInstanceOf ?model . OPTIONAL { ?model rdfs:label ?modelLabel } }
      OPTIONAL { ?uri for:workflowInitialization/for:laminate ?laminate . OPTIONAL { ?laminate rdfs:label ?laminateLabel } }
      OPTIONAL { ?uri prov:startedAtTime ?start } OPTIONAL { ?uri prov:endedAtTime ?end }
      ${constraints.join('\n')}`
    const [rows, count] = await Promise.all([
      this
        .select(`SELECT ?uri (SAMPLE(?label) AS ?title) (SAMPLE(?state) AS ?status) (SAMPLE(?laminate) AS ?input)
        (SAMPLE(?laminateLabel) AS ?inputLabel) (SAMPLE(?model) AS ?process) (SAMPLE(?modelLabel) AS ?processLabel)
        (SAMPLE(?start) AS ?started) (SAMPLE(?end) AS ?ended) (COUNT(DISTINCT ?dataset) AS ?datasetCount)
        WHERE { ${where} OPTIONAL { ?observation wild:inWorkflowInstance ?uri . ?dataset a dcat:Dataset ; prov:wasGeneratedBy ?observation } }
        GROUP BY ?uri ORDER BY DESC(?started) STR(?uri) LIMIT ${size} OFFSET ${Math.max(0, filters.page ?? 0) * size}`),
      this.select(`SELECT (COUNT(DISTINCT ?uri) AS ?total) WHERE { ${where} }`),
    ])
    return {
      total: Number(count[0]?.total?.value ?? 0),
      items: rows.map((b) => ({
        uri: b.uri!.value,
        label: b.title?.value ?? compact(b.uri!.value),
        state: b.status?.value ?? '',
        laminate: b.input?.value ?? '',
        laminateLabel: b.inputLabel?.value ?? '',
        model: b.process?.value ?? '',
        modelLabel: b.processLabel?.value ?? '',
        start: b.started?.value ?? '',
        end: b.ended?.value ?? '',
        datasetCount: Number(b.datasetCount?.value ?? 0),
      })),
    }
  }
  async listDatasets(filters: Filters = {}, pageSize = 12): Promise<Page<DatasetSummary>> {
    const size = Math.max(1, Math.min(100, pageSize)),
      constraints: string[] = []
    for (const key of ['run', 'model', 'sensor', 'property', 'feature'] as const)
      if (filters[key]) constraints.push(`FILTER(?${key} = ${safeIri(filters[key])})`)
    if (filters.media) constraints.push(`FILTER(STR(?media) = ${textLiteral(filters.media)})`)
    if (filters.search)
      constraints.push(
        `FILTER(CONTAINS(LCASE(CONCAT(STR(COALESCE(?title, "")), " ", STR(COALESCE(?description, "")))), LCASE(${textLiteral(filters.search)})))`,
      )
    const where = `?uri a dcat:Dataset .
      OPTIONAL { ?uri dct:title ?title } OPTIONAL { ?uri dct:description ?description }
      OPTIONAL { ?uri prov:wasGeneratedBy ?observation .
        OPTIONAL { ?observation wild:inWorkflowInstance ?run . OPTIONAL { ?run wild:workflowInstanceOf ?model } }
        OPTIONAL { ?observation sosa:madeBySensor ?sensor }
        OPTIONAL { ?observation sosa:observedProperty ?property }
        OPTIONAL { ?observation sosa:hasFeatureOfInterest ?feature }
      }
      OPTIONAL { ?uri dcat:distribution/dcat:mediaType ?media }
      ${constraints.join('\n')}`
    const [rows, count] = await Promise.all([
      this.select(`SELECT ?uri (SAMPLE(?title) AS ?label) (SAMPLE(?description) AS ?descriptionText)
        (SAMPLE(?run) AS ?runIri) (SAMPLE(?sensor) AS ?sensorIri) (SAMPLE(?property) AS ?propertyIri)
        (SAMPLE(?feature) AS ?featureIri) (GROUP_CONCAT(DISTINCT STR(?media); separator=", ") AS ?mediaTypes)
        WHERE { ${where} } GROUP BY ?uri ORDER BY LCASE(STR(?label)) STR(?uri)
        LIMIT ${size} OFFSET ${Math.max(0, filters.page ?? 0) * size}`),
      this.select(`SELECT (COUNT(DISTINCT ?uri) AS ?total) WHERE { ${where} }`),
    ])
    return {
      total: Number(count[0]?.total?.value ?? 0),
      items: rows.map((b) => ({
        uri: b.uri!.value,
        label: b.label?.value ?? compact(b.uri!.value),
        description: b.descriptionText?.value ?? '',
        run: b.runIri?.value ?? '',
        sensor: b.sensorIri?.value ?? '',
        property: b.propertyIri?.value ?? '',
        feature: b.featureIri?.value ?? '',
        media: b.mediaTypes?.value ?? '',
      })),
    }
  }
  async facets(): Promise<{ kind: string; uri: string; label: string }[]> {
    const rows = await this.select(`SELECT DISTINCT ?kind ?uri ?label WHERE {
      { ?uri a wild:WorkflowInstance . BIND("run" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?uri a wild:WorkflowModel . BIND("model" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?uri a for:Laminate . BIND("laminate" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?uri a sosa:Sensor . BIND("sensor" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?uri a sosa:ObservableProperty . BIND("property" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?obs sosa:hasFeatureOfInterest ?uri . BIND("feature" AS ?kind) OPTIONAL { ?uri rdfs:label ?label } }
      UNION { ?dist dcat:mediaType ?uri . BIND("media" AS ?kind) }
    } ORDER BY ?kind STR(?uri)`)
    return [
      ...new Map(
        rows.map((b) => [
          b.kind!.value + b.uri!.value,
          {
            kind: b.kind!.value,
            uri: b.uri!.value,
            label: b.label?.value ?? compact(b.uri!.value),
          },
        ]),
      ).values(),
    ]
  }
  async stats(): Promise<Record<string, number>> {
    const rows = await this.select(`SELECT ?kind (COUNT(DISTINCT ?entity) AS ?count) WHERE {
      { ?entity a wild:WorkflowInstance . BIND("runs" AS ?kind) }
      UNION { ?entity a wild:WorkflowInstance ; wild:hasState wild:initialized . BIND("initialized" AS ?kind) }
      UNION { ?entity a wild:WorkflowInstance ; wild:hasState wild:done . BIND("completed" AS ?kind) }
      UNION { ?entity a for:Laminate . BIND("laminates" AS ?kind) }
      UNION { ?entity a dcat:Dataset . BIND("datasets" AS ?kind) }
    } GROUP BY ?kind`)
    return Object.fromEntries(rows.map((b) => [b.kind!.value, Number(b.count!.value)]))
  }
  async usedLaminates(excludeRun?: string): Promise<string[]> {
    const rows = await this.select(`SELECT DISTINCT ?laminate WHERE {
      ?run a wild:WorkflowInstance ; for:workflowInitialization/for:laminate ?laminate .
      ${excludeRun ? `FILTER(?run != ${safeIri(excludeRun)})` : ''}
    }`)
    return rows.map((row) => row.laminate!.value)
  }
  private laminateOwnership(uri: string, subject = '?s') {
    const root = safeIri(uri)
    const path = LAMINATE_PATH
    // A shared resource and everything below it must survive. Reference points,
    // vocabulary terms and shapes are never traversed by this ownership path.
    return `${root} ${path}* ${subject} .
      FILTER(${subject} != rdf:nil)
      FILTER(${subject} = ${root} || NOT EXISTS {
        ${root} ${path}* ?ancestor . ?ancestor ${path}* ${subject} .
        FILTER(?ancestor != ${root})
        ?outside ?link ?ancestor .
        FILTER NOT EXISTS { ${root} ${path}* ?outside }
      })`
  }
  private laminateDeletion(uri: string, preserveMetadata = false) {
    const root = safeIri(uri)
    return `${this.laminateOwnership(uri)} ?s ?p ?o .
      ${preserveMetadata ? `FILTER(?s != ${root} || (?p = rdf:type && ?o = for:Laminate) || ?p IN (rdfs:label, dct:identifier, geo:hasSize, prov:wasDerivedFrom, param:hasNeedlePoint))` : ''}`
  }
  async saveLaminate(draft: LaminateDraft, references: Store, editing = false): Promise<string> {
    const graph = await validateLaminate(draft, references)
    const root = safeIri(draft.uri)
    const children = graph
      .getSubjects(null, null, null)
      .filter((subject) => subject.value !== draft.uri)
      .map((subject) => safeIri(subject.value))
      .join(' ')
    // Stable child identities may only replace resources exclusively owned by this laminate.
    const conflicts = `VALUES ?candidate { ${children} }
      FILTER EXISTS { ?candidate ?existingPredicate ?existingObject }
      FILTER NOT EXISTS { ${this.laminateOwnership(draft.uri, '?candidate')} }`
    const noConflicts = `FILTER NOT EXISTS { ${conflicts} }`
    if (!editing && (await this.ask(`ASK { ${root} ?p ?o }`)))
      throw new Error('This laminate identity is already registered. Start a new laminate.')
    if (editing && !(await this.ask(`ASK { ${root} a for:Laminate }`)))
      throw new Error('This laminate no longer exists.')
    // Evaluate the edit guard once, before expanding the triples to replace.
    await this.update(
      editing
        ? `DELETE { ?s ?p ?o } INSERT { ${serialize(graph)} } WHERE {
          { SELECT (true AS ?canSaveLaminate) WHERE { ${noConflicts} } }
          ${root} a for:Laminate . ${this.laminateDeletion(draft.uri, true)}
        }`
        : `INSERT { ${serialize(graph)} } WHERE {
          FILTER NOT EXISTS { ${root} ?p ?o } ${noConflicts}
        }`,
    )
    if (!(await this.ask(`ASK { ${serialize(graph)} ${noConflicts} }`))) {
      if (await this.ask(`ASK { ${conflicts} }`))
        throw new Error(
          'Some laminate resources are shared with other records and cannot be overwritten. Create a copy of the laminate to save these changes.',
        )
      throw new Error(
        'The save could not be confirmed. Your inputs are retained; refresh before retrying.',
      )
    }
    return draft.uri
  }
  async deleteLaminate(uri: string): Promise<void> {
    const root = safeIri(uri)
    const incoming = `?source ?relation ${root} . FILTER(?source != ${root})`
    if (await this.ask(`ASK { ${incoming} }`))
      throw new Error(
        'This laminate is referenced by other records and cannot be deleted. Remove those references first.',
      )
    await this.update(`DELETE { ?s ?p ?o } WHERE {
      ${root} a for:Laminate . FILTER NOT EXISTS { ${incoming} }
      ${this.laminateDeletion(uri)}
    }`)
    if (await this.ask(`ASK { ${root} a for:Laminate }`))
      throw new Error(
        'The laminate could not be deleted. It may have acquired a reference; refresh and try again.',
      )
  }
  async initializeRun(draft: InitializationDraft, references: Store): Promise<string> {
    const graph = await validateInitialization(draft, references)
    const run = initializationIris(draft).run
    const conflictingRun = `?otherRun a wild:WorkflowInstance ;
      for:workflowInitialization/for:laminate ${safeIri(draft.laminate)} .
      FILTER(?otherRun != ${safeIri(run)})`
    await this.update(
      `INSERT { ${serialize(graph)} } WHERE {
        FILTER NOT EXISTS { ${safeIri(run)} ?p ?o }
        FILTER NOT EXISTS { ${conflictingRun} }
      }`,
    )
    if (!(await this.ask(`ASK { ${safeIri(run)} a wild:WorkflowInstance }`))) {
      if (await this.ask(`ASK { ${conflictingRun} }`)) throw new Error(LAMINATE_IN_USE_MESSAGE)
      throw new Error(
        'The run could not be confirmed. Your draft has been kept; retry with the same identity.',
      )
    }
    const stored = merge(references, await this.getRunContext(run))
    const saved = copySettings(stored, run, references, draft.id)
    saved.name = label(stored, run)
    saved.notes = value(stored, run, NS.rdfs + 'comment')
    if (settingsFingerprint(saved) !== settingsFingerprint(draft))
      throw new Error(
        'This draft identity already belongs to a saved run with different settings. Open the saved run or start a fresh draft.',
      )
    return run
  }
}
export const repository = new KnowledgeRepository()
export const CATALOG = BASE + 'vpd#it'

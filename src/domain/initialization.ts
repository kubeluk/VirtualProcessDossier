import {
  BASE,
  NS,
  Store,
  df,
  n,
  object,
  objects,
  value,
  list,
  addList,
  isType,
  safeIri,
} from './rdf'
import type { Term } from './rdf'
import { flatten, workflowTree, runActivities, runLaminate } from './model'
import type { InitializationDraft } from './types'

export const SYSTEMS = {
  gripping: BASE + 'system/frame/1#it',
  heating: BASE + 'system/oven/1#it',
  pressing: BASE + 'system/press/1#it',
}
export const SHAPES = {
  gripping: BASE + 'system/frame/1#parameters',
  heating: BASE + 'system/oven/1#parameters',
  pressing: BASE + 'system/press/1#parameters',
}
export const MODEL = BASE + 'workflow#stampForming'
export const REFERENCE = BASE + 'system/frame#referencePoint'

function property(
  g: Store,
  shape: Term | string | undefined,
  predicate: string,
  seen = new Set<string>(),
): Term | undefined {
  if (!shape) return undefined
  const key = typeof shape === 'string' ? shape : shape.value
  if (seen.has(key)) return undefined
  seen.add(key)
  const direct = objects(g, shape, NS.sh + 'property').find(
    (p) => value(g, p, NS.sh + 'path') === predicate,
  )
  if (direct) return direct
  for (const parent of objects(g, shape, NS.sh + 'node')) {
    const inherited = property(g, parent, predicate, seen)
    if (inherited) return inherited
  }
  return undefined
}
function propertyAt(g: Store, shape: string, path: string[]): Term | undefined {
  let current: Term | string | undefined = shape
  for (const predicate of path) {
    const p = property(g, current, predicate)
    if (predicate === path[path.length - 1]) return p
    current = object(g, p, NS.sh + 'node')
  }
  return undefined
}
export function fieldHelp(g: Store, shape: string, path: string[]): string {
  return value(g, propertyAt(g, shape, path), NS.sh + 'description')
}
function defaultAt(g: Store, shape: string, path: string[]): string {
  return value(g, propertyAt(g, shape, path), NS.sh + 'defaultValue')
}
function allowed(g: Store, shape: string, path: string[]): string[] {
  const p = propertyAt(g, shape, path)
  const enumList =
    object(g, p, NS.sh + 'in') ?? object(g, object(g, p, NS.sh + 'node'), NS.sh + 'in')
  return list(g, enumList).map((t) => t.value)
}
export function createDraft(g: Store, id: string = crypto.randomUUID()): InitializationDraft {
  for (const shape of Object.values(SHAPES))
    if (!isType(g, shape, NS.sh + 'NodeShape'))
      throw new Error('The equipment parameter shapes are not available. Check the seed data.')
  const defaultSteps = object(
    g,
    propertyAt(g, SHAPES.pressing, [NS.press + 'closingSteps']),
    NS.sh + 'defaultValue',
  )
  const q = (node: Term, pred: string) => value(g, object(g, node, pred), NS.qudt + 'value')
  const setpoint = defaultAt(g, SHAPES.gripping, [
    NS.frame + 'gripperSetpoint',
    NS.frame + 'setpoint',
    NS.qudt + 'value',
  ])
  return {
    id,
    name: '',
    notes: '',
    model: MODEL,
    laminate: '',
    laminateConfirmed: false,
    copiedFrom: '',
    grippers: allowed(g, SHAPES.gripping, [
      NS.frame + 'gripperPosition',
      NS.frame + 'ofGripper',
    ]).map((iri) => ({
      iri,
      x: '',
      y: '',
      gripping: setpoint,
      heating: setpoint,
      pressing: setpoint,
    })),
    oven: {
      threshold: defaultAt(g, SHAPES.heating, [
        NS.oven + 'thresholdTemperature',
        NS.qudt + 'value',
      ]),
      holding: defaultAt(g, SHAPES.heating, [NS.oven + 'stableHoldingTime', NS.qudt + 'value']),
      fields: allowed(g, SHAPES.heating, [
        NS.oven + 'fieldTargetTemperature',
        NS.oven + 'atField',
      ]).map((iri) => ({
        iri,
        value: defaultAt(g, SHAPES.heating, [
          NS.oven + 'fieldTargetTemperature',
          NS.oven + 'fieldTarget',
          NS.qudt + 'value',
        ]),
      })),
    },
    press: {
      devices: allowed(g, SHAPES.pressing, [
        NS.oven + 'heatingDeviceTargetTemperature',
        NS.oven + 'atDevice',
      ]).map((iri) => ({
        iri,
        value: defaultAt(g, SHAPES.pressing, [
          NS.oven + 'heatingDeviceTargetTemperature',
          NS.oven + 'deviceTemperature',
          NS.qudt + 'value',
        ]),
      })),
      force: defaultAt(g, SHAPES.pressing, [NS.press + 'force', NS.qudt + 'value']),
      cooling: defaultAt(g, SHAPES.pressing, [NS.press + 'moldCoolingTime', NS.qudt + 'value']),
      remaining: defaultAt(g, SHAPES.pressing, [NS.press + 'remainingPath', NS.qudt + 'value']),
      molds: allowed(g, SHAPES.pressing, [NS.press + 'moldTemperature', NS.press + 'mold']).map(
        (iri) => ({
          iri,
          value: defaultAt(g, SHAPES.pressing, [
            NS.press + 'moldTemperature',
            NS.press + 'temperature',
            NS.qudt + 'value',
          ]),
        }),
      ),
      steps: list(g, defaultSteps).map((step) => ({
        speed: q(step, NS.press + 'closingSpeed'),
        distance: q(step, NS.press + 'remainingDistance'),
      })),
    },
  }
}
export function copySettings(
  g: Store,
  run: string,
  references: Store,
  id: string = crypto.randomUUID(),
): InitializationDraft {
  const draft = createDraft(references, id)
  draft.model = value(g, run, NS.wild + 'workflowInstanceOf')
  draft.copiedFrom = run
  draft.laminate = runLaminate(g, run)
  const plans = new Map(
    runActivities(g, run).map((activity) => [
      value(g, activity, NS.wild + 'activityInstanceOf'),
      object(g, activity, NS.for + 'initialization'),
    ]),
  )
  const frame = plans.get(NS.activity + 'gripping'),
    oven = plans.get(NS.activity + 'heating'),
    press = plans.get(NS.activity + 'pressing')
  if (!frame || !oven || !press)
    throw new Error('This run does not have all three initialization plans to copy.')
  const q = (s: Term | undefined, p: string) => value(g, object(g, s, p), NS.qudt + 'value')
  draft.grippers = draft.grippers.map((gripper) => {
    const position = objects(g, frame, NS.frame + 'gripperPosition').find(
      (t) => value(g, t, NS.frame + 'ofGripper') === gripper.iri,
    )
    const coords = list(g, object(g, object(g, position, NS.frame + 'position'), NS.qudt + 'value'))
    const updated = { ...gripper, x: coords[0]?.value ?? '', y: coords[1]?.value ?? '' }
    for (const stage of ['gripping', 'heating', 'pressing'] as const) {
      const entry = objects(g, frame, NS.frame + 'gripperSetpoint').find(
        (t) =>
          value(g, t, NS.frame + 'ofGripper') === gripper.iri &&
          value(g, t, NS.frame + 'atActivity') === NS.activity + stage,
      )
      updated[stage] = q(entry, NS.frame + 'setpoint')
    }
    return updated
  })
  draft.oven.threshold = q(oven, NS.oven + 'thresholdTemperature')
  draft.oven.holding = q(oven, NS.oven + 'stableHoldingTime')
  for (const [plan, rows, pred, component, quantity] of [
    [
      oven,
      draft.oven.fields,
      NS.oven + 'fieldTargetTemperature',
      NS.oven + 'atField',
      NS.oven + 'fieldTarget',
    ],
    [
      press,
      draft.press.devices,
      NS.oven + 'heatingDeviceTargetTemperature',
      NS.oven + 'atDevice',
      NS.oven + 'deviceTemperature',
    ],
    [
      press,
      draft.press.molds,
      NS.press + 'moldTemperature',
      NS.press + 'mold',
      NS.press + 'temperature',
    ],
  ] as const) {
    for (const row of rows)
      row.value = q(
        objects(g, plan, pred).find((t) => value(g, t, component) === row.iri),
        quantity,
      )
  }
  draft.press.force = q(press, NS.press + 'force')
  draft.press.cooling = q(press, NS.press + 'moldCoolingTime')
  draft.press.remaining = q(press, NS.press + 'remainingPath')
  draft.press.steps = list(g, object(g, press, NS.press + 'closingSteps')).map((step) => ({
    speed: q(step, NS.press + 'closingSpeed'),
    distance: q(step, NS.press + 'remainingDistance'),
  }))
  return draft
}
export function initializationIris(draft: InitializationDraft) {
  if (!/^[a-zA-Z0-9-]+$/.test(draft.id)) throw new Error('Invalid draft identity.')
  return {
    run: BASE + 'workflow/instance/' + draft.id + '#it',
    plan: (stage: string) => BASE + 'plan/' + draft.id + '#' + stage,
    activity: (index: number) => BASE + 'workflow/instance/' + draft.id + '#activity-' + index,
  }
}
export function draftErrors(draft: InitializationDraft, references: Store): string[] {
  const errors: string[] = []
  if (!draft.name.trim()) errors.push('Enter a run name.')
  if (!draft.laminate || !isType(references, draft.laminate, NS.for + 'Laminate'))
    errors.push('Select a registered laminate.')
  if (!draft.laminateConfirmed) errors.push('Confirm the input laminate.')
  if (draft.model !== MODEL) errors.push('This process is not supported for initialization.')
  const expected = createDraft(references, draft.id)
  const checkComponents = (actual: { iri: string }[], wanted: { iri: string }[], name: string) => {
    if (
      actual.length !== wanted.length ||
      new Set(actual.map((t) => t.iri)).size !== wanted.length ||
      actual.some((t) => !wanted.some((w) => w.iri === t.iri))
    )
      errors.push('Provide exactly one entry for each ' + name + '.')
  }
  checkComponents(draft.grippers, expected.grippers, 'gripper')
  checkComponents(draft.oven.fields, expected.oven.fields, 'oven field')
  checkComponents(draft.press.devices, expected.press.devices, 'press heater')
  checkComponents(draft.press.molds, expected.press.molds, 'mold')
  const decimal = (v: string, field: string) => {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) || !Number.isFinite(Number(v)))
      errors.push(field + ': enter a finite decimal number.')
  }
  for (const [i, gripper] of draft.grippers.entries()) {
    decimal(gripper.x, 'Gripper ' + (i + 1) + ' X')
    decimal(gripper.y, 'Gripper ' + (i + 1) + ' Y')
    for (const stage of ['gripping', 'heating', 'pressing'] as const)
      if (!/^[+-]?\d+$/.test(gripper[stage]) || !Number.isSafeInteger(Number(gripper[stage])))
        errors.push('Gripper ' + (i + 1) + ' ' + stage + ': enter an integer setpoint.')
  }
  decimal(draft.oven.threshold, 'Threshold temperature')
  decimal(draft.oven.holding, 'Stable holding time')
  for (const row of [...draft.oven.fields, ...draft.press.devices, ...draft.press.molds])
    decimal(row.value, row.iri)
  decimal(draft.press.force, 'Press force')
  decimal(draft.press.cooling, 'Mold cooling time')
  decimal(draft.press.remaining, 'Remaining path')
  if (!draft.press.steps.length) errors.push('Add at least one press closing step.')
  for (const [i, step] of draft.press.steps.entries()) {
    decimal(step.speed, 'Closing step ' + (i + 1) + ' speed')
    decimal(step.distance, 'Closing step ' + (i + 1) + ' remaining distance')
  }
  return errors
}
export function buildInitialization(draft: InitializationDraft, references: Store): Store {
  const errors = draftErrors(draft, references)
  if (errors.length) throw new Error(errors.join('\n'))
  const tree = workflowTree(references, draft.model)
  if (!tree) throw new Error('The process definition is missing.')
  const ids = initializationIris(draft),
    g = new Store(),
    run = n(ids.run)
  const add = (s: Term, p: string, o: Term) => g.addQuad(s as NamedNode, n(p), o as NamedNode)
  const type = (s: Term, t: string) => add(s, NS.rdf + 'type', n(t))
  const decimal = (v: string) =>
    df.literal(
      v.includes('.') ? v.replace(/^\+/, '') : v.replace(/^\+/, '') + '.0',
      n(NS.xsd + 'decimal'),
    )
  function q(v: string, u: string, kind?: string, integer = false): Term {
    const node = df.blankNode()
    type(node, NS.qudt + 'Quantity')
    add(node, NS.qudt + 'hasUnit', n(NS.unit + u))
    if (kind) add(node, NS.qudt + 'hasQuantityKind', n(NS.kind + kind))
    add(node, NS.qudt + 'value', integer ? df.literal(v, n(NS.xsd + 'integer')) : decimal(v))
    return node
  }
  type(run, NS.wild + 'WorkflowInstance')
  add(run, NS.rdfs + 'label', df.literal(draft.name.trim()))
  if (draft.notes.trim()) add(run, NS.rdfs + 'comment', df.literal(draft.notes.trim()))
  add(run, NS.wild + 'workflowInstanceOf', n(draft.model))
  add(run, NS.wild + 'hasState', n(NS.wild + 'initialized'))
  const init = df.blankNode(),
    collection = df.blankNode()
  add(run, NS.for + 'workflowInitialization', init)
  add(init, NS.for + 'laminate', n(draft.laminate))
  add(init, NS.for + 'parameterization', collection)
  type(collection, NS.prov + 'Collection')
  const activities = [...new Map(flatten(tree).map((a) => [a.uri, a])).values()]
  for (const stage of Object.keys(SYSTEMS))
    if (!activities.some((a) => a.uri === NS.activity + stage))
      throw new Error('The required machine activity is missing: ' + stage)
  activities.forEach((activity, index) => {
    const instance = n(ids.activity(index))
    type(instance, NS.wild + 'ActivityInstance')
    add(instance, NS.wild + 'activityInstanceOf', n(activity.uri))
    add(instance, NS.wild + 'inWorkflowInstance', run)
    add(instance, NS.wild + 'hasState', n(NS.wild + 'initialized'))
    const system = object(references, activity.uri, NS.ssn + 'implementedBy')
    const shape = value(references, system, NS.for + 'takesParameters')
    const stage = (Object.keys(SYSTEMS) as (keyof typeof SYSTEMS)[]).find(
      (key) => activity.uri === NS.activity + key,
    )
    if (shape && (!stage || shape !== SHAPES[stage]))
      throw new Error('Unsupported equipment parameter shape: ' + shape)
    if (!stage) return
    const plan = n(ids.plan(stage))
    type(plan, NS.prov + 'Plan')
    add(instance, NS.for + 'initialization', plan)
    add(plan, NS.for + 'initialized', instance)
    add(collection, NS.prov + 'hadMember', plan)
  })
  const gripping = n(ids.plan('gripping')),
    heating = n(ids.plan('heating')),
    pressing = n(ids.plan('pressing'))
  for (const gripper of draft.grippers) {
    const entry = df.blankNode(),
      position = df.blankNode()
    add(gripping, NS.frame + 'gripperPosition', entry)
    add(entry, NS.frame + 'ofGripper', n(gripper.iri))
    add(entry, NS.frame + 'position', position)
    type(position, NS.qudt + 'Quantity')
    add(position, NS.qudt + 'hasUnit', n(NS.unit + 'MilliM'))
    add(position, NS.qudt + 'hasQuantityKind', n(NS.kind + 'PositionVector'))
    add(position, NS.qudt + 'value', addList(g, [decimal(gripper.x), decimal(gripper.y)]))
    add(position, NS.prov + 'wasDerivedFrom', n(REFERENCE))
    for (const stage of ['gripping', 'heating', 'pressing'] as const) {
      const setpoint = df.blankNode()
      add(gripping, NS.frame + 'gripperSetpoint', setpoint)
      add(setpoint, NS.frame + 'ofGripper', n(gripper.iri))
      add(setpoint, NS.frame + 'atActivity', n(NS.activity + stage))
      add(setpoint, NS.frame + 'setpoint', q(gripper[stage], 'UNITLESS', undefined, true))
    }
  }
  add(
    heating,
    NS.oven + 'thresholdTemperature',
    q(draft.oven.threshold, 'DEG_C', 'AreaTemperature'),
  )
  add(heating, NS.oven + 'stableHoldingTime', q(draft.oven.holding, 'SEC', 'Time'))
  for (const [plan, rows, predicate, component, quant, kind] of [
    [
      heating,
      draft.oven.fields,
      'fieldTargetTemperature',
      'atField',
      'fieldTarget',
      'AreaTemperature',
    ],
    [
      pressing,
      draft.press.devices,
      'heatingDeviceTargetTemperature',
      'atDevice',
      'deviceTemperature',
      'Temperature',
    ],
  ] as const)
    for (const row of rows) {
      const entry = df.blankNode()
      add(plan, NS.oven + predicate, entry)
      add(entry, NS.oven + component, n(row.iri))
      add(entry, NS.oven + quant, q(row.value, 'DEG_C', kind))
    }
  add(pressing, NS.press + 'force', q(draft.press.force, 'KiloN', 'Force'))
  add(pressing, NS.press + 'moldCoolingTime', q(draft.press.cooling, 'SEC', 'Time'))
  add(pressing, NS.press + 'remainingPath', q(draft.press.remaining, 'MilliM', 'Distance'))
  for (const row of draft.press.molds) {
    const entry = df.blankNode()
    add(pressing, NS.press + 'moldTemperature', entry)
    add(entry, NS.press + 'mold', n(row.iri))
    add(entry, NS.press + 'temperature', q(row.value, 'DEG_C', 'Temperature'))
  }
  add(
    pressing,
    NS.press + 'closingSteps',
    addList(
      g,
      draft.press.steps.map((step) => {
        const entry = df.blankNode()
        add(entry, NS.press + 'closingSpeed', q(step.speed, 'MilliM-PER-SEC', 'LinearVelocity'))
        add(entry, NS.press + 'remainingDistance', q(step.distance, 'MilliM', 'Distance'))
        return entry
      }),
    ),
  )
  safeIri(ids.run)
  return g
}
type NamedNode = ReturnType<typeof n>
export async function validatePlans(
  data: Store,
  shapes: Store,
  plans: { plan: string; shape: string }[],
): Promise<string[]> {
  const { default: Validator } = await import('shacl-engine/Validator.js')
  const validator = new Validator(shapes, { factory: { ...df, dataset: () => new Store() } })
  const errors: string[] = []
  for (const item of plans) {
    const report = await validator.validate({ dataset: data, terms: [n(item.plan)] }, [
      { terms: [n(item.shape)] },
    ])
    if (!report.conforms)
      errors.push(
        'The ' +
          item.plan.split('#').pop() +
          ' plan does not satisfy its equipment shape. Check required values, units, and component assignments.',
      )
  }
  return errors
}
export async function validateInitialization(
  draft: InitializationDraft,
  references: Store,
): Promise<Store> {
  const graph = buildInitialization(draft, references)
  const ids = initializationIris(draft)
  const errors = await validatePlans(
    graph,
    references,
    Object.entries(SHAPES).map(([stage, shape]) => ({ plan: ids.plan(stage), shape })),
  )
  if (errors.length) throw new Error(errors.join('\n'))
  return graph
}
export function settingsFingerprint(draft: InitializationDraft): string {
  const normalized = (v: string) => {
    const negative = v.startsWith('-')
    const [whole = '', fraction = ''] = v.replace(/^[+-]/, '').split('.')
    const integer = whole.replace(/^0+/, '') || '0'
    const decimal = fraction.replace(/0+$/, '')
    const number = integer + (decimal ? '.' + decimal : '')
    return negative && number !== '0' ? '-' + number : number
  }
  const rows = (values: { iri: string; value: string }[]) =>
    [...values]
      .sort((a, b) => a.iri.localeCompare(b.iri))
      .map((row) => [row.iri, normalized(row.value)])
  return JSON.stringify({
    name: draft.name.trim(),
    notes: draft.notes.trim(),
    model: draft.model,
    laminate: draft.laminate,
    grippers: [...draft.grippers]
      .sort((a, b) => a.iri.localeCompare(b.iri))
      .map((row) => [
        row.iri,
        ...[row.x, row.y, row.gripping, row.heating, row.pressing].map(normalized),
      ]),
    oven: [
      normalized(draft.oven.threshold),
      normalized(draft.oven.holding),
      rows(draft.oven.fields),
    ],
    press: [
      normalized(draft.press.force),
      normalized(draft.press.cooling),
      normalized(draft.press.remaining),
      rows(draft.press.devices),
      rows(draft.press.molds),
      draft.press.steps.map((row) => [normalized(row.speed), normalized(row.distance)]),
    ],
  })
}

import { NS, n, object, objects, list, type Store, type Term } from './rdf'
import { parameterComponents, SHAPES } from './initialization'

export interface ParameterRow {
  name: string
  component?: Term
  quantities: Term[]
}
export interface ParameterGroup {
  name: string
  rows: ParameterRow[]
}

/** Read execution facts directly, without draft defaults or planned-value fallbacks. */
export function usedParameterGroups(
  g: Store,
  activity: Term | string,
  plan: Term,
): ParameterGroup[] {
  const model = object(g, activity, NS.wild + 'activityInstanceOf')?.value
  const scalar = (name: string, predicate: string): ParameterRow => ({
    name,
    quantities: objects(g, plan, predicate),
  })
  function components(
    stage: keyof typeof SHAPES,
    predicate: string,
    component: string,
    quantity: string,
    entries = objects(g, plan, predicate),
  ): ParameterRow[] {
    const expected = parameterComponents(g, SHAPES[stage], [predicate, component]).map(n)
    const recorded = entries.flatMap((entry) => objects(g, entry, component))
    const identities = [...new Map([...expected, ...recorded].map((t) => [t.value, t])).values()]
    const rows: ParameterRow[] = identities.map((identity) => ({
      name: '',
      component: identity,
      quantities: entries
        .filter((entry) => objects(g, entry, component).some((t) => t.equals(identity)))
        .flatMap((entry) => objects(g, entry, quantity)),
    }))
    // Keep entries without a recorded component visible, too.
    rows.push(
      ...entries
        .filter((entry) => !objects(g, entry, component).length)
        .map((entry) => ({
          name: 'Component not recorded',
          component: undefined,
          quantities: objects(g, entry, quantity),
        })),
    )
    return rows
  }
  if (model === NS.activity + 'gripping') {
    return [
      {
        name: 'Gripper positions',
        rows: components(
          'gripping',
          NS.frame + 'gripperPosition',
          NS.frame + 'ofGripper',
          NS.frame + 'position',
        ),
      },
      ...['gripping', 'heating', 'pressing'].map((stage) => ({
        name: stage[0]!.toUpperCase() + stage.slice(1) + ' setpoints',
        rows: components(
          'gripping',
          NS.frame + 'gripperSetpoint',
          NS.frame + 'ofGripper',
          NS.frame + 'setpoint',
          objects(g, plan, NS.frame + 'gripperSetpoint').filter((entry) =>
            objects(g, entry, NS.frame + 'atActivity').some((t) => t.value === NS.activity + stage),
          ),
        ),
      })),
    ]
  }
  if (model === NS.activity + 'heating') {
    return [
      {
        name: 'Infrared oven',
        rows: [
          scalar('Threshold temperature', NS.oven + 'thresholdTemperature'),
          scalar('Stable holding time', NS.oven + 'stableHoldingTime'),
        ],
      },
      {
        name: 'Field targets',
        rows: components(
          'heating',
          NS.oven + 'fieldTargetTemperature',
          NS.oven + 'atField',
          NS.oven + 'fieldTarget',
        ),
      },
    ]
  }
  if (model === NS.activity + 'pressing') {
    return [
      {
        name: 'Press',
        rows: [
          scalar('Press force', NS.press + 'force'),
          scalar('Mold cooling time', NS.press + 'moldCoolingTime'),
          scalar('Remaining path', NS.press + 'remainingPath'),
        ],
      },
      {
        name: 'Mold temperatures',
        rows: components(
          'pressing',
          NS.press + 'moldTemperature',
          NS.press + 'mold',
          NS.press + 'temperature',
        ),
      },
      {
        name: 'Ordered closing profile',
        rows: objects(g, plan, NS.press + 'closingSteps').flatMap((head) =>
          list(g, head).flatMap((step, index) => [
            {
              name: 'Step ' + (index + 1) + ' closing speed',
              quantities: objects(g, step, NS.press + 'closingSpeed'),
            },
            {
              name: 'Step ' + (index + 1) + ' remaining distance',
              quantities: objects(g, step, NS.press + 'remainingDistance'),
            },
          ]),
        ),
      },
    ]
  }
  return []
}

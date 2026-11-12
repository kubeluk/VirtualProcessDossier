import { NS, typed, value, object, list, label, objects, isType } from './rdf'
import type { Store, Term } from './rdf'
import type { ActivityNode } from './types'

export function workflowTree(g: Store, model: string): ActivityNode | undefined {
  const root = object(g, model, NS.wild + 'hasBehaviour')
  if (!root) return undefined
  function build(node: Term, ancestors: Set<string>): ActivityNode {
    if (ancestors.has(node.value)) throw new Error('The process definition contains a cycle.')
    const next = new Set(ancestors).add(node.value)
    return {
      uri: node.value,
      label: label(g, node),
      type: isType(g, node, NS.wild + 'SequentialActivity')
        ? 'sequential'
        : isType(g, node, NS.wild + 'ParallelActivity')
          ? 'parallel'
          : 'atomic',
      children: list(g, object(g, node, NS.wild + 'hasChildActivities')).map((child) =>
        build(child, next),
      ),
    }
  }
  return build(root, new Set())
}
export function flatten(root: ActivityNode): ActivityNode[] {
  return [root, ...root.children.flatMap(flatten)]
}
export const runActivities = (g: Store, run: string) =>
  typed(g, NS.wild + 'ActivityInstance').filter(
    (t) => value(g, t, NS.wild + 'inWorkflowInstance') === run,
  )
export function instancesFor(g: Store, run: string, modelActivity: string): Term[] {
  return runActivities(g, run).filter(
    (t) => value(g, t, NS.wild + 'activityInstanceOf') === modelActivity,
  )
}
export function runLaminate(g: Store, run: string): string {
  return value(g, object(g, run, NS.for + 'workflowInitialization'), NS.for + 'laminate')
}
export function datasetsFor(g: Store, observation: Term | string): Term[] {
  const id = typeof observation === 'string' ? observation : observation.value
  return typed(g, NS.dcat + 'Dataset').filter((t) =>
    objects(g, t, NS.prov + 'wasGeneratedBy').some((o) => o.value === id),
  )
}
export function describeState(iri: string): string {
  const states: Record<string, string> = {
    initialized: 'Initialized',
    done: 'Completed',
    active: 'Active',
  }
  return iri ? (states[iri.replace(NS.wild, '')] ?? iri.replace(NS.wild, '')) : 'Not recorded'
}

/** Planned settings belong only to the run's parameterization collection. */
export function runPlans(g: Store, run: string): Term[] {
  const members = objects(g, run, NS.for + 'workflowInitialization').flatMap((init) =>
    objects(g, init, NS.for + 'parameterization').flatMap((collection) =>
      objects(g, collection, NS.prov + 'hadMember'),
    ),
  )
  return [...new Map(members.map((plan) => [plan.value, plan])).values()]
}

/** Keep each execution plan with its association and recorded equipment. */
export function executionPlans(g: Store, activity: Term | string) {
  return objects(g, activity, NS.prov + 'qualifiedAssociation').flatMap((association) =>
    objects(g, association, NS.prov + 'hadPlan').map((plan) => ({
      association,
      plan,
      equipment: objects(g, association, NS.prov + 'agent'),
    })),
  )
}

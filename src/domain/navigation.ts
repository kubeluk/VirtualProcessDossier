import { NS, isType } from './rdf'
import type { Store } from './rdf'
export function entityRoute(uri: string, graph: Store, kind = '') {
  let path = '/entity'
  if (kind === 'run' || isType(graph, uri, NS.wild + 'WorkflowInstance')) path = '/run'
  else if (kind === 'dataset' || isType(graph, uri, NS.dcat + 'Dataset')) path = '/dataset'
  else if (kind === 'laminate' || isType(graph, uri, NS.for + 'Laminate')) path = '/laminate'
  else if (kind === 'process' || isType(graph, uri, NS.wild + 'WorkflowModel')) path = '/process'
  else if (
    kind === 'equipment' ||
    [NS.ssn + 'System', NS.sosa + 'Sensor', NS.sosa + 'Actuator'].some((t) => isType(graph, uri, t))
  )
    path = '/equipment'
  return { path, query: { uri } }
}

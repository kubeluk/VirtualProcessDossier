import { BASE, NS } from './rdf'
/** Demonstrator configuration from get-observation-bindings.rq, not discovered execution facts. */
export const observationExpectations = new Map<
  string,
  { sensor: string; property: string; feature: string; group: string }
>()
for (const property of ['angle', 'force', 'extension'])
  for (let i = 1; i <= 8; i++) {
    observationExpectations.set(
      NS.activity + 'observeGripper' + property[0]!.toUpperCase() + property.slice(1) + i,
      {
        sensor: BASE + 'sensor/' + property + '/' + i + '#it',
        property: BASE + 'property#' + property,
        feature: BASE + 'system/gripper/' + i + '#it',
        group: 'Gripper ' + property,
      },
    )
  }
observationExpectations.set(NS.activity + 'observeLaminateSurfaceTemperature1', {
  sensor: BASE + 'sensor/pyrometer/1#it',
  property: BASE + 'property#surfaceTemperature',
  feature: '',
  group: 'Surface temperature',
})
for (let i = 1; i <= 4; i++)
  observationExpectations.set(NS.activity + 'observeLaminateShape' + i, {
    sensor: BASE + 'sensor/camera/1#it',
    property: BASE + 'property#surfaceGeometry',
    feature: '',
    group: 'Surface geometry',
  })

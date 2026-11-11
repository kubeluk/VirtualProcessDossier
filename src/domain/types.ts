export interface RunSummary {
  uri: string
  label: string
  state: string
  laminate: string
  laminateLabel: string
  model: string
  modelLabel: string
  start: string
  end: string
  datasetCount: number
}
export interface DatasetSummary {
  uri: string
  label: string
  description: string
  run: string
  sensor: string
  property: string
  feature: string
  media: string
}
export interface Filters {
  search?: string
  state?: string
  laminate?: string
  model?: string
  run?: string
  sensor?: string
  property?: string
  feature?: string
  media?: string
  from?: string
  to?: string
  page?: number
}
export interface Page<T> {
  items: T[]
  total: number
}
export interface ScalarEntry {
  iri: string
  value: string
}
export interface Gripper {
  iri: string
  x: string
  y: string
  gripping: string
  heating: string
  pressing: string
}
export interface ClosingStep {
  speed: string
  distance: string
}
export interface InitializationDraft {
  id: string
  name: string
  notes: string
  model: string
  laminate: string
  laminateConfirmed: boolean
  copiedFrom: string
  grippers: Gripper[]
  oven: { threshold: string; holding: string; fields: ScalarEntry[] }
  press: {
    force: string
    cooling: string
    remaining: string
    devices: ScalarEntry[]
    molds: ScalarEntry[]
    steps: ClosingStep[]
  }
}
export interface ActivityNode {
  uri: string
  label: string
  type: 'atomic' | 'sequential' | 'parallel'
  children: ActivityNode[]
}

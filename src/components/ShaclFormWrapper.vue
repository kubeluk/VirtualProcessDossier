<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Props {
  shapes?: string
  shapesUrl?: string
  shapeSubject?: string
  values?: string
  valuesUrl?: string
  valuesSubject?: string
  valuesNamespace?: string
  valuesGraph?: string
  viewMode?: boolean
  submitButtonLabel?: string
  language?: string
  collapse?: 'open' | ''
  hierarchyColors?: string
  showNodeIds?: boolean
  showRootShapeLabel?: boolean
  dense?: boolean
  useShadowRoot?: boolean
  proxy?: string
  serializeFormat?: string
}

const props = withDefaults(defineProps<Props>(), {
  dense: true,
  useShadowRoot: true,
  serializeFormat: 'text/turtle',
})

const emit = defineEmits<{
  ready: []
  change: [payload: { valid: boolean; report: unknown; rdf: string }]
  submit: [payload: { rdf: string }]
}>()

const shaclFormEl = ref<HTMLElementTagNameMap['shacl-form'] | null>(null)
const isValid = ref(false)
const validationReport = ref<unknown>(null)
const rdfData = ref('')

const elementAttributes = computed(() => {
  const a: Record<string, string | undefined> = {}
  if (props.shapes) a['data-shapes'] = props.shapes
  if (props.shapesUrl) a['data-shapes-url'] = props.shapesUrl
  if (props.shapeSubject) a['data-shape-subject'] = props.shapeSubject
  if (props.values) a['data-values'] = props.values
  if (props.valuesUrl) a['data-values-url'] = props.valuesUrl
  if (props.valuesSubject) a['data-values-subject'] = props.valuesSubject
  if (props.valuesNamespace) a['data-values-namespace'] = props.valuesNamespace
  if (props.valuesGraph) a['data-values-graph'] = props.valuesGraph
  if (props.language) a['data-language'] = props.language
  if (props.proxy) a['data-proxy'] = props.proxy
  if (props.collapse !== undefined) a['data-collapse'] = props.collapse
  if (props.hierarchyColors) a['data-hierarchy-colors'] = props.hierarchyColors
  if (props.showNodeIds) a['data-show-node-ids'] = ''
  if (props.showRootShapeLabel) a['data-show-root-shape-label'] = ''
  a['data-dense'] = String(props.dense !== false)
  a['data-use-shadow-root'] = String(props.useShadowRoot !== false)
  if (props.viewMode) a['data-view'] = ''
  if (!props.viewMode && props.submitButtonLabel !== undefined)
    a['data-submit-button'] = props.submitButtonLabel
  return a
})

function onFormChange(event: Event) {
  const { valid, report } = (event as CustomEvent).detail
  isValid.value = valid
  validationReport.value = report
  const rdf = shaclFormEl.value!.serialize(props.serializeFormat)
  rdfData.value = rdf
  emit('change', { valid, report, rdf })
}

function onFormSubmit() {
  const rdf = shaclFormEl.value!.serialize(props.serializeFormat)
  rdfData.value = rdf
  emit('submit', { rdf })
}

function onFormReady() {
  emit('ready')
}

onMounted(() => {
  const el = shaclFormEl.value
  if (!el) return
  el.addEventListener('change', onFormChange)
  el.addEventListener('submit', onFormSubmit)
  el.addEventListener('ready', onFormReady)
})

onUnmounted(() => {
  const el = shaclFormEl.value
  if (!el) return
  el.removeEventListener('change', onFormChange)
  el.removeEventListener('submit', onFormSubmit)
  el.removeEventListener('ready', onFormReady)
})

defineExpose({ isValid, validationReport, rdfData, shaclFormEl })
</script>

<template>
  <shacl-form ref="shaclFormEl" v-bind="elementAttributes" />
</template>

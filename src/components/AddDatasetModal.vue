<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useCatalogStore, type AddDatasetForm } from '@/stores/catalog'
import { useWorkflowStore, type WorkflowStepOption } from '@/stores/workflow'

const props = defineProps<{
  modelValue: boolean
  preselectedStepUri?: string
  // When set, filters step options to this specific run and pre-fills the instance
  workflowInstanceUri?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [datasetUri: string]
}>()

const catalog = useCatalogStore()
const workflowStore = useWorkflowStore()

// Form state
const title = ref('')
const description = ref('')
const keywords = ref('')
const downloadUrl = ref('')
const mediaType = ref('')
const byteSize = ref('')
const selectedStepUri = ref('')
const selectedWorkflowInstanceUri = ref('')
const isFullWorkflowLink = ref(false)

// Step options
const stepOptions = ref<WorkflowStepOption[]>([])
const loadingSteps = ref(false)
const loadError = ref<string | null>(null)

// UI state
const submitting = ref(false)
const submitError = ref<string | null>(null)

// When workflowInstanceUri prop is set, limit choices to that run's options
const visibleOptions = computed(() => {
  if (!props.workflowInstanceUri) return stepOptions.value
  return stepOptions.value.filter((o) => o.workflowInstanceUri === props.workflowInstanceUri)
})

// Group visible step options by workflow for display
const groupedOptions = computed(() => {
  const groups = new Map<string, { workflowTitle: string | null; options: WorkflowStepOption[] }>()
  for (const opt of visibleOptions.value) {
    if (!groups.has(opt.workflowUri)) {
      groups.set(opt.workflowUri, { workflowTitle: opt.workflowTitle, options: [] })
    }
    groups.get(opt.workflowUri)!.options.push(opt)
  }
  return [...groups.values()]
})

// When the preselectedStepUri changes or the modal opens, sync the selection
watch(
  () => [props.modelValue, props.preselectedStepUri, visibleOptions.value.length] as const,
  ([open]) => {
    if (!open) return
    applyPreselection()
  },
)

function applyPreselection() {
  if (!props.preselectedStepUri) {
    selectedStepUri.value = ''
    selectedWorkflowInstanceUri.value = props.workflowInstanceUri ?? ''
    isFullWorkflowLink.value = false
    return
  }
  // Exact match — atomic step or full-workflow option (uri === workflowUri)
  const exact = visibleOptions.value.find((o) => o.uri === props.preselectedStepUri)
  if (exact) {
    selectedStepUri.value = exact.uri
    selectedWorkflowInstanceUri.value = exact.workflowInstanceUri ?? ''
    isFullWorkflowLink.value = exact.uri === exact.workflowUri
    return
  }
  // Parallel step URI: preselect the first leaf whose parentStepUri matches
  const leaf = visibleOptions.value.find((o) => o.parentStepUri === props.preselectedStepUri)
  if (leaf) {
    selectedStepUri.value = leaf.uri
    selectedWorkflowInstanceUri.value = leaf.workflowInstanceUri ?? ''
    isFullWorkflowLink.value = false
  }
}

// Keep workflowInstanceUri and isFullWorkflowLink in sync with the selected step
function onStepChange() {
  const opt = visibleOptions.value.find((o) => o.uri === selectedStepUri.value)
  selectedWorkflowInstanceUri.value = opt?.workflowInstanceUri ?? ''
  isFullWorkflowLink.value = opt ? opt.uri === opt.workflowUri : false
}

onMounted(async () => {
  loadingSteps.value = true
  loadError.value = null
  try {
    stepOptions.value = await workflowStore.fetchWorkflowStepOptions()
    applyPreselection()
  } catch {
    loadError.value = 'Could not load workflow steps from the triple store.'
  } finally {
    loadingSteps.value = false
  }
})

function close() {
  emit('update:modelValue', false)
}

function reset() {
  title.value = ''
  description.value = ''
  keywords.value = ''
  downloadUrl.value = ''
  mediaType.value = ''
  byteSize.value = ''
  selectedStepUri.value = ''
  selectedWorkflowInstanceUri.value = ''
  isFullWorkflowLink.value = false
  submitError.value = null
}

async function submit() {
  submitError.value = null

  if (!title.value.trim()) {
    submitError.value = 'Title is required.'
    return
  }
  if (!downloadUrl.value.trim()) {
    submitError.value = 'Download URL is required.'
    return
  }
  try {
    new URL(downloadUrl.value.trim())
  } catch {
    submitError.value = 'Download URL must be a valid URL.'
    return
  }

  const form: AddDatasetForm = {
    title: title.value.trim(),
    description: description.value.trim(),
    keywords: keywords.value,
    downloadUrl: downloadUrl.value.trim(),
    mediaType: mediaType.value.trim(),
    byteSize: byteSize.value.trim(),
    stepUri: selectedStepUri.value,
    workflowInstanceUri: selectedWorkflowInstanceUri.value,
    isFullWorkflowLink: isFullWorkflowLink.value,
  }

  submitting.value = true
  try {
    const uri = await catalog.addDataset(form)
    reset()
    close()
    emit('created', uri)
  } catch (e) {
    submitError.value = 'Failed to save dataset. Check the triple store is running.'
    console.error(e)
  } finally {
    submitting.value = false
  }
}

// Build option label: indent leaf activities under their parent parallel step
function optionLabel(opt: WorkflowStepOption): string {
  if (opt.parentStepTitle) return `    ${opt.label}`
  return opt.label
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title">Add Dataset</h2>
          <button class="modal-close" aria-label="Close" @click="close">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="submit">
          <!-- Title -->
          <div class="field">
            <label for="ds-title" class="field-label">Title <span class="required">*</span></label>
            <input
              id="ds-title"
              v-model="title"
              type="text"
              class="field-input"
              placeholder="e.g. Hydraulic Pressure Readings"
              autocomplete="off"
            />
          </div>

          <!-- Description -->
          <div class="field">
            <label for="ds-desc" class="field-label">Description</label>
            <textarea
              id="ds-desc"
              v-model="description"
              class="field-input field-textarea"
              rows="3"
              placeholder="Brief description of what this dataset contains"
            />
          </div>

          <!-- Keywords -->
          <div class="field">
            <label for="ds-keywords" class="field-label">Keywords</label>
            <input
              id="ds-keywords"
              v-model="keywords"
              type="text"
              class="field-input"
              placeholder="pressure, hydraulics, manufacturing  (comma-separated)"
              autocomplete="off"
            />
          </div>

          <hr class="divider" />

          <!-- Download URL -->
          <div class="field">
            <label for="ds-url" class="field-label">
              Download URL <span class="required">*</span>
            </label>
            <input
              id="ds-url"
              v-model="downloadUrl"
              type="url"
              class="field-input"
              placeholder="https://example.org/files/dataset.csv"
              autocomplete="off"
            />
          </div>

          <!-- Media type + byte size on one row -->
          <div class="field-row">
            <div class="field">
              <label for="ds-media" class="field-label">Media type</label>
              <input
                id="ds-media"
                v-model="mediaType"
                type="text"
                class="field-input"
                placeholder="text/csv"
                list="media-type-list"
                autocomplete="off"
              />
              <datalist id="media-type-list">
                <option value="text/csv" />
                <option value="application/json" />
                <option value="application/x-parquet" />
                <option value="application/x-hdf" />
                <option value="application/octet-stream" />
              </datalist>
            </div>

            <div class="field field--narrow">
              <label for="ds-size" class="field-label">File size (bytes)</label>
              <input
                id="ds-size"
                v-model="byteSize"
                type="number"
                min="0"
                class="field-input"
                placeholder="41943040"
              />
            </div>
          </div>

          <hr class="divider" />

          <!-- Workflow step -->
          <div class="field">
            <label for="ds-step" class="field-label">Workflow step</label>
            <p v-if="loadError" class="load-error">{{ loadError }}</p>
            <p class="field-hint">
              Link this dataset to the step where it was collected, or to a full workflow if it
              spans multiple steps.
            </p>
            <select
              id="ds-step"
              v-model="selectedStepUri"
              class="field-input field-select"
              :disabled="loadingSteps"
              @change="onStepChange"
            >
              <option value="">— No connection —</option>
              <template v-if="!loadingSteps">
                <optgroup
                  v-for="group in groupedOptions"
                  :key="group.workflowTitle ?? 'wf'"
                  :label="group.workflowTitle ?? 'Workflow'"
                >
                  <template v-for="opt in group.options" :key="opt.uri">
                    <!-- Insert a disabled "header" row before the first leaf of a parallel step -->
                    <option
                      v-if="
                        opt.parentStepUri &&
                        !group.options
                          .slice(0, group.options.indexOf(opt))
                          .some((o) => o.parentStepUri === opt.parentStepUri)
                      "
                      disabled
                      value=""
                      class="group-header"
                    >
                      ▸ {{ opt.parentStepTitle }}
                    </option>
                    <option :value="opt.uri">{{ optionLabel(opt) }}</option>
                  </template>
                </optgroup>
              </template>
            </select>
          </div>

          <!-- Error -->
          <p v-if="submitError" class="submit-error">{{ submitError }}</p>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" class="btn btn--secondary" :disabled="submitting" @click="close">
              Cancel
            </button>
            <button type="submit" class="btn btn--primary" :disabled="submitting">
              {{ submitting ? 'Saving…' : 'Add Dataset' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal {
  background: var(--color-background);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1rem;
  color: #6b7280;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
}

.modal-close:hover {
  background: #f3f4f6;
  color: var(--color-text);
}

.modal-body {
  padding: 1.25rem 1.5rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.field--narrow {
  max-width: 180px;
}

.field-row {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.field-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
}

.required {
  color: #dc2626;
}

.field-hint {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.45;
}

.field-input {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
  color: var(--color-text);
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus {
  border-color: var(--color-primary);
}

.field-textarea {
  resize: vertical;
  min-height: 5rem;
}

.field-select {
  cursor: pointer;
}

.field-select:disabled {
  background: #f9fafb;
  color: #9ca3af;
  cursor: default;
}

.group-header {
  font-style: italic;
  color: #6b7280;
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}

.load-error {
  font-size: 0.8rem;
  color: #dc2626;
  margin: 0 0 0.25rem;
}

.submit-error {
  font-size: 0.875rem;
  color: #dc2626;
  margin: 0;
  padding: 0.6rem 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 6px;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn--primary:hover:not(:disabled) {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.btn--primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.btn--secondary {
  background: #fff;
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn--secondary:hover:not(:disabled) {
  background: #f9fafb;
}

.btn--secondary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useCatalogStore, type AddDatasetForm, type DatasetFilterOptions } from '@/stores/catalog'

const props = defineProps<{
  modelValue: boolean
  workflowInstanceUri?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [datasetUri: string]
}>()

const catalog = useCatalogStore()

// Form state
const title = ref('')
const description = ref('')
const downloadUrl = ref('')
const mediaType = ref('')
const temporalResolution = ref('')
const selectedWorkflowInstanceUri = ref('')

// Run options
const runOptions = ref<DatasetFilterOptions['workflowRuns']>([])
const loadingRuns = ref(false)
const loadError = ref<string | null>(null)

// UI state
const submitting = ref(false)
const submitError = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) selectedWorkflowInstanceUri.value = props.workflowInstanceUri ?? ''
  },
)

onMounted(async () => {
  loadingRuns.value = true
  loadError.value = null
  try {
    const opts = await catalog.fetchFilterOptions()
    runOptions.value = opts.workflowRuns
    selectedWorkflowInstanceUri.value = props.workflowInstanceUri ?? ''
  } catch {
    loadError.value = 'Could not load workflow runs from the triple store.'
  } finally {
    loadingRuns.value = false
  }
})

function close() {
  emit('update:modelValue', false)
}

function reset() {
  title.value = ''
  description.value = ''
  downloadUrl.value = ''
  mediaType.value = ''
  temporalResolution.value = ''
  selectedWorkflowInstanceUri.value = props.workflowInstanceUri ?? ''
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
    downloadUrl: downloadUrl.value.trim(),
    mediaType: mediaType.value.trim(),
    temporalResolution: temporalResolution.value.trim(),
    workflowInstanceUri: selectedWorkflowInstanceUri.value,
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
              placeholder="e.g. Heating Phase Sensor Data"
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
              placeholder="https://example.org/files/dataset.txt"
              autocomplete="off"
            />
          </div>

          <!-- Media type + temporal resolution on one row -->
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
                <option value="text/tab-separated-values" />
                <option value="application/json" />
                <option value="application/x-parquet" />
                <option value="application/x-hdf" />
              </datalist>
            </div>

            <div class="field">
              <label for="ds-resolution" class="field-label">Temporal resolution</label>
              <input
                id="ds-resolution"
                v-model="temporalResolution"
                type="text"
                class="field-input"
                placeholder="PT0.02S"
                autocomplete="off"
              />
              <span class="field-hint">ISO 8601 duration, e.g. PT0.02S = 50 Hz</span>
            </div>
          </div>

          <hr class="divider" />

          <!-- Workflow run -->
          <div class="field">
            <label for="ds-run" class="field-label">Workflow run</label>
            <p v-if="loadError" class="load-error">{{ loadError }}</p>
            <select
              id="ds-run"
              v-model="selectedWorkflowInstanceUri"
              class="field-input field-select"
              :disabled="loadingRuns"
            >
              <option value="">— No connection —</option>
              <option v-for="run in runOptions" :key="run.uri" :value="run.uri">
                {{ run.label ?? run.uri }}
              </option>
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

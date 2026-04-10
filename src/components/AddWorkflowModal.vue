<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWorkflowStore, type StepForm, type SubStepForm, type AddWorkflowForm } from '@/stores/workflow'

const props = defineProps<{
  modelValue: boolean
  editUri?: string        // When set: edit mode (update existing workflow)
  editData?: AddWorkflowForm | null  // Pre-populated form data for edit mode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [workflowUri: string]
}>()

const workflowStore = useWorkflowStore()
const isEditMode = computed(() => !!props.editUri)

// Form state
const title = ref('')
const description = ref('')
const steps = ref<(StepForm & { id: number; subSteps: (SubStepForm & { id: number })[] })[]>([])
let nextId = 0

// UI state
const submitting = ref(false)
const submitError = ref<string | null>(null)

function close() {
  emit('update:modelValue', false)
}

function reset() {
  title.value = ''
  description.value = ''
  steps.value = [newStep()]
  submitError.value = null
}

function populateFrom(data: AddWorkflowForm) {
  title.value = data.title
  description.value = data.description
  steps.value = data.steps.map((s) => ({
    id: nextId++,
    title: s.title,
    description: s.description,
    type: s.type,
    subSteps: s.subSteps.map((ss) => ({ id: nextId++, ...ss })),
  }))
  submitError.value = null
}

// Sync form when modal opens
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    if (props.editData) {
      populateFrom(props.editData)
    } else {
      reset()
    }
  },
)

function newStep() {
  return { id: nextId++, title: '', description: '', type: 'AtomicActivity' as const, subSteps: [] }
}

function newSubStep() {
  return { id: nextId++, title: '', description: '' }
}

function addStep() {
  steps.value.push(newStep())
}

function removeStep(idx: number) {
  steps.value.splice(idx, 1)
}

function onTypeChange(idx: number) {
  const step = steps.value[idx]
  if (step.type === 'ParallelActivity' && step.subSteps.length < 2) {
    // Pre-fill with 2 sub-steps
    step.subSteps = [newSubStep(), newSubStep()]
  } else if (step.type === 'AtomicActivity') {
    step.subSteps = []
  }
}

function addSubStep(stepIdx: number) {
  steps.value[stepIdx].subSteps.push(newSubStep())
}

function removeSubStep(stepIdx: number, subIdx: number) {
  steps.value[stepIdx].subSteps.splice(subIdx, 1)
}

function validate(): string | null {
  if (!title.value.trim()) return 'Workflow title is required.'
  if (steps.value.length === 0) return 'At least one step is required.'
  for (let i = 0; i < steps.value.length; i++) {
    const s = steps.value[i]
    if (!s.title.trim()) return `Step ${i + 1} title is required.`
    if (s.type === 'ParallelActivity') {
      if (s.subSteps.length < 2) return `Parallel step ${i + 1} must have at least 2 sub-steps.`
      for (let j = 0; j < s.subSteps.length; j++) {
        if (!s.subSteps[j].title.trim())
          return `Sub-step ${j + 1} in step ${i + 1} title is required.`
      }
    }
  }
  return null
}

async function submit() {
  submitError.value = null
  const err = validate()
  if (err) {
    submitError.value = err
    return
  }

  const form: AddWorkflowForm = {
    title: title.value.trim(),
    description: description.value.trim(),
    steps: steps.value.map((s) => ({
      title: s.title.trim(),
      description: s.description.trim(),
      type: s.type,
      subSteps: s.subSteps.map((ss) => ({
        title: ss.title.trim(),
        description: ss.description.trim(),
      })),
    })),
  }

  submitting.value = true
  try {
    if (isEditMode.value && props.editUri) {
      await workflowStore.updateWorkflowModel(props.editUri, form)
      reset()
      close()
      emit('created', props.editUri)
    } else {
      const uri = await workflowStore.addWorkflowModel(form)
      reset()
      close()
      emit('created', uri)
    }
  } catch (e) {
    submitError.value = 'Failed to save workflow. Check the triple store is running.'
    console.error(e)
  } finally {
    submitting.value = false
  }
}

// Initialize with one empty step
reset()
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="wf-modal-title">
        <div class="modal-header">
          <h2 id="wf-modal-title">{{ isEditMode ? 'Edit Workflow Model' : 'Create Workflow Model' }}</h2>
          <button class="modal-close" aria-label="Close" @click="close">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="submit">
          <!-- Title -->
          <div class="field">
            <label for="wf-title" class="field-label">
              Title <span class="required">*</span>
            </label>
            <input
              id="wf-title"
              v-model="title"
              type="text"
              class="field-input"
              placeholder="e.g. Manufacturing Line Assembly"
              autocomplete="off"
            />
          </div>

          <!-- Description -->
          <div class="field">
            <label for="wf-desc" class="field-label">Description</label>
            <textarea
              id="wf-desc"
              v-model="description"
              class="field-input field-textarea"
              rows="2"
              placeholder="Brief description of this workflow"
            />
          </div>

          <hr class="divider" />

          <!-- Steps -->
          <div class="steps-section">
            <div class="steps-header">
              <span class="field-label">Process Steps <span class="required">*</span></span>
              <p class="field-hint">
                Define the sequence of steps. Use "Parallel step" when sub-activities happen simultaneously.
              </p>
            </div>

            <div
              v-for="(step, si) in steps"
              :key="step.id"
              class="step-card"
            >
              <div class="step-card-header">
                <span class="step-number">Step {{ si + 1 }}</span>
                <button
                  type="button"
                  class="remove-btn"
                  :disabled="steps.length === 1"
                  @click="removeStep(si)"
                >
                  Remove
                </button>
              </div>

              <div class="field">
                <label :for="`step-title-${step.id}`" class="field-label">
                  Title <span class="required">*</span>
                </label>
                <input
                  :id="`step-title-${step.id}`"
                  v-model="step.title"
                  type="text"
                  class="field-input"
                  placeholder="e.g. Material Preparation"
                  autocomplete="off"
                />
              </div>

              <div class="field">
                <label :for="`step-desc-${step.id}`" class="field-label">Description</label>
                <input
                  :id="`step-desc-${step.id}`"
                  v-model="step.description"
                  type="text"
                  class="field-input"
                  placeholder="Optional step description"
                  autocomplete="off"
                />
              </div>

              <div class="field field--type">
                <span class="field-label">Type</span>
                <div class="radio-group">
                  <label class="radio-label">
                    <input
                      v-model="step.type"
                      type="radio"
                      value="AtomicActivity"
                      @change="onTypeChange(si)"
                    />
                    Single step
                  </label>
                  <label class="radio-label">
                    <input
                      v-model="step.type"
                      type="radio"
                      value="ParallelActivity"
                      @change="onTypeChange(si)"
                    />
                    Parallel step
                  </label>
                </div>
              </div>

              <!-- Sub-steps for parallel -->
              <div v-if="step.type === 'ParallelActivity'" class="substeps-section">
                <div
                  v-for="(sub, ssi) in step.subSteps"
                  :key="sub.id"
                  class="substep-row"
                >
                  <span class="substep-label">{{ String.fromCharCode(97 + ssi) }}.</span>
                  <div class="substep-fields">
                    <input
                      v-model="sub.title"
                      type="text"
                      class="field-input"
                      :placeholder="`Sub-step title (required)`"
                      autocomplete="off"
                    />
                    <input
                      v-model="sub.description"
                      type="text"
                      class="field-input substep-desc"
                      placeholder="Description (optional)"
                      autocomplete="off"
                    />
                  </div>
                  <button
                    type="button"
                    class="remove-btn remove-btn--small"
                    :disabled="step.subSteps.length <= 2"
                    @click="removeSubStep(si, ssi)"
                  >
                    ✕
                  </button>
                </div>
                <button type="button" class="add-substep-btn" @click="addSubStep(si)">
                  + Add sub-step
                </button>
              </div>
            </div>

            <button type="button" class="add-step-btn" @click="addStep">+ Add Step</button>
          </div>

          <!-- Error -->
          <p v-if="submitError" class="submit-error">{{ submitError }}</p>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" class="btn btn--secondary" :disabled="submitting" @click="close">
              Cancel
            </button>
            <button type="submit" class="btn btn--primary" :disabled="submitting">
              {{ submitting ? (isEditMode ? 'Saving…' : 'Creating…') : (isEditMode ? 'Save Changes' : 'Create Workflow') }}
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
  max-width: 600px;
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
  margin: 0.2rem 0 0;
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
  box-sizing: border-box;
  width: 100%;
}

.field-input:focus {
  border-color: var(--color-primary);
}

.field-textarea {
  resize: vertical;
  min-height: 4rem;
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}

/* Steps section */
.steps-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.steps-header {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.step-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: #fafafa;
}

.step-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-number {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
}

.remove-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.2rem 0.6rem;
  font-size: 0.78rem;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.remove-btn:hover:not(:disabled) {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}

.remove-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.field--type .radio-group {
  display: flex;
  gap: 1.25rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  color: var(--color-text);
  cursor: pointer;
}

/* Sub-steps */
.substeps-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: #f0fdf4;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
}

.substep-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.substep-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
  padding-top: 0.55rem;
  flex-shrink: 0;
  width: 1.2rem;
}

.substep-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.substep-desc {
  font-size: 0.85rem;
}

.remove-btn--small {
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
  margin-top: 0.45rem;
  flex-shrink: 0;
}

.add-substep-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: #166534;
  cursor: pointer;
  font-family: inherit;
  align-self: flex-start;
}

.add-substep-btn:hover {
  color: #14532d;
}

.add-step-btn {
  background: none;
  border: 1px dashed var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  align-self: flex-start;
}

.add-step-btn:hover {
  background: #f0fdf4;
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

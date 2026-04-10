<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useWorkflowStore, type StepForm, type AddWorkflowForm } from '@/stores/workflow'
import StepEditorNode, { type StepFormWithId, newStepWithId } from '@/components/StepEditorNode.vue'

const props = defineProps<{
  modelValue: boolean
  editUri?: string
  editData?: AddWorkflowForm | null
  metadataOnly?: boolean
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
const steps = ref<StepFormWithId[]>([])

// UI state
const submitting = ref(false)
const submitError = ref<string | null>(null)

function close() {
  emit('update:modelValue', false)
}

function reset() {
  title.value = ''
  description.value = ''
  steps.value = [newStepWithId()]
  submitError.value = null
}

function toStepFormWithId(s: StepForm): StepFormWithId {
  return {
    id: Math.random(),  // just needs to be unique for :key
    uri: s.uri,
    title: s.title,
    description: s.description,
    type: s.type,
    children: s.children.map(toStepFormWithId),
  }
}

function populateFrom(data: AddWorkflowForm) {
  title.value = data.title
  description.value = data.description
  steps.value = data.steps.map(toStepFormWithId)
  submitError.value = null
}

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

function addStep() {
  steps.value.push(newStepWithId())
}

function removeStep(idx: number) {
  steps.value.splice(idx, 1)
}

function validate(): string | null {
  if (!title.value.trim()) return 'Workflow title is required.'
  if (steps.value.length === 0) return 'At least one step is required.'

  function validateNode(s: StepFormWithId, path: string): string | null {
    if (!s.title.trim()) return `${path} title is required.`
    if (s.type !== 'AtomicActivity') {
      if (s.children.length < 1) return `${path} must have at least one sub-activity.`
      if (s.type === 'ParallelActivity' && s.children.length < 2)
        return `${path} (parallel) must have at least 2 branches.`
      for (let i = 0; i < s.children.length; i++) {
        const err = validateNode(s.children[i], `${path} › sub-activity ${i + 1}`)
        if (err) return err
      }
    }
    return null
  }

  for (let i = 0; i < steps.value.length; i++) {
    const err = validateNode(steps.value[i], `Step ${i + 1}`)
    if (err) return err
  }
  return null
}

function toStepForm(s: StepFormWithId): StepForm {
  return {
    ...(s.uri ? { uri: s.uri } : {}),
    title: s.title.trim(),
    description: s.description.trim(),
    type: s.type,
    children: s.children.map(toStepForm),
  }
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
    steps: steps.value.map(toStepForm),
  }

  submitting.value = true
  try {
    if (isEditMode.value && props.editUri) {
      if (props.metadataOnly) {
        await workflowStore.updateWorkflowModelMetadata(props.editUri, form)
      } else {
        await workflowStore.updateWorkflowModel(props.editUri, form)
      }
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

reset()
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="wf-modal-title">
        <div class="modal-header">
          <h2 id="wf-modal-title">
            {{
              isEditMode
                ? metadataOnly
                  ? 'Edit Workflow Names & Descriptions'
                  : 'Edit Workflow Model'
                : 'Create Workflow Model'
            }}
          </h2>
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
              <span class="field-label">
                Process Steps <span v-if="!metadataOnly" class="required">*</span>
              </span>
              <p v-if="metadataOnly" class="field-hint">
                Step structure is fixed once a workflow has runs. You can edit names and descriptions.
              </p>
              <p v-else class="field-hint">
                Define the sequence of steps. Use "Parallel" or "Sequential" to create nested
                composite activities.
              </p>
            </div>

            <StepEditorNode
              v-for="(step, si) in steps"
              :key="step.id"
              :step="step"
              :depth="0"
              :step-num="si + 1"
              :can-remove="steps.length > 1"
              :metadata-only="!!metadataOnly"
              @remove="removeStep(si)"
            />

            <button v-if="!metadataOnly" type="button" class="add-step-btn" @click="addStep">
              + Add Step
            </button>
          </div>

          <!-- Error -->
          <p v-if="submitError" class="submit-error">{{ submitError }}</p>

          <!-- Actions -->
          <div class="modal-actions">
            <button type="button" class="btn btn--secondary" :disabled="submitting" @click="close">
              Cancel
            </button>
            <button type="submit" class="btn btn--primary" :disabled="submitting">
              {{
                submitting
                  ? isEditMode
                    ? 'Saving…'
                    : 'Creating…'
                  : isEditMode
                    ? 'Save Changes'
                    : 'Create Workflow'
              }}
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
  max-width: 640px;
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

.required { color: #dc2626; }

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

.field-input:focus { border-color: var(--color-primary); }

.field-textarea {
  resize: vertical;
  min-height: 4rem;
}

.divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}

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

.add-step-btn:hover { background: #f0fdf4; }

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

.btn--secondary:hover:not(:disabled) { background: #f9fafb; }

.btn--secondary:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

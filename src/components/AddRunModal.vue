<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkflowStore } from '@/stores/workflow'

const props = defineProps<{
  modelValue: boolean
  workflowUri: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [instanceUri: string]
}>()

const workflowStore = useWorkflowStore()

const title = ref('')
const description = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      title.value = ''
      description.value = ''
      submitError.value = null
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

async function submit() {
  if (!title.value.trim()) return
  submitting.value = true
  submitError.value = null
  try {
    const uri = await workflowStore.addWorkflowRun(
      props.workflowUri,
      title.value.trim(),
      description.value.trim(),
    )
    emit('created', uri)
    close()
  } catch {
    submitError.value = 'Failed to start run. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">Start New Run</h2>
          <button class="modal-close" aria-label="Close" @click="close">×</button>
        </div>

        <form class="modal-body" @submit.prevent="submit">
          <div class="field">
            <label class="field-label" for="run-title">Title <span class="required">*</span></label>
            <input
              id="run-title"
              v-model="title"
              class="field-input"
              type="text"
              placeholder="e.g. Production run 2026-04-11"
              required
              autofocus
            />
          </div>

          <div class="field">
            <label class="field-label" for="run-description">Description</label>
            <textarea
              id="run-description"
              v-model="description"
              class="field-input field-textarea"
              placeholder="Optional notes about this run"
              rows="3"
            />
          </div>

          <p v-if="submitError" class="submit-error">{{ submitError }}</p>
        </form>

        <div class="modal-footer">
          <button class="btn btn--secondary" type="button" :disabled="submitting" @click="close">
            Cancel
          </button>
          <button
            class="btn btn--primary"
            type="submit"
            :disabled="submitting || !title.trim()"
            @click="submit"
          >
            {{ submitting ? 'Starting…' : 'Start Run' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--color-background);
  border-radius: 10px;
  width: 100%;
  max-width: 480px;
  margin: 1rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.4rem;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
  padding: 0 0.25rem;
}

.modal-close:hover {
  color: var(--color-text);
}

.modal-body {
  padding: 1.25rem 1.5rem;
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
  font-weight: 500;
  color: var(--color-text);
}

.required {
  color: #dc2626;
}

.field-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-background);
  outline: none;
  transition: border-color 0.15s;
}

.field-input:focus {
  border-color: var(--color-primary);
}

.field-textarea {
  resize: vertical;
  min-height: 72px;
}

.submit-error {
  font-size: 0.85rem;
  color: #dc2626;
  margin: 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

.btn {
  padding: 0.45rem 1.1rem;
  border-radius: 6px;
  font-size: 0.875rem;
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
  opacity: 0.55;
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

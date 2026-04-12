<script setup lang="ts">
import { ref, watch } from 'vue'
import { useWorkflowStore, type AtomicActivityForm, type AtomicActivitySummary, type ProcedureOption } from '@/stores/workflow'

const props = defineProps<{
  modelValue: boolean
  editActivity?: AtomicActivitySummary | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [uri: string]
  updated: [uri: string]
  deleted: [uri: string]
}>()

const workflowStore = useWorkflowStore()

const title = ref('')
const description = ref('')
const systemUri = ref('')
const inputUri = ref('')

const systemOptions = ref<ProcedureOption[]>([])
const inputOptions = ref<ProcedureOption[]>([])

const submitting = ref(false)
const deleting = ref(false)
const activityInUse = ref(false)
const submitError = ref<string | null>(null)

const isEditMode = ref(false)
const editUri = ref<string | null>(null)

function close() {
  emit('update:modelValue', false)
}

function reset() {
  title.value = ''
  description.value = ''
  systemUri.value = ''
  inputUri.value = ''
  submitError.value = null
  isEditMode.value = false
  editUri.value = null
  activityInUse.value = false
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    const [systems, inputs] = await Promise.all([
      workflowStore.fetchSystemOptions(),
      workflowStore.fetchInputOptions(),
    ])
    systemOptions.value = systems
    inputOptions.value = inputs

    if (props.editActivity) {
      isEditMode.value = true
      editUri.value = props.editActivity.uri
      title.value = props.editActivity.title ?? ''
      description.value = props.editActivity.description ?? ''
      systemUri.value = props.editActivity.systemUri ?? ''
      inputUri.value = props.editActivity.inputUri ?? ''
      submitError.value = null
      activityInUse.value = await workflowStore.isAtomicActivityInUse(props.editActivity.uri)
    } else {
      reset()
    }
  },
)

async function submit() {
  submitError.value = null
  if (!title.value.trim()) {
    submitError.value = 'Activity title is required.'
    return
  }
  const form: AtomicActivityForm = {
    title: title.value.trim(),
    description: description.value.trim(),
    systemUri: systemUri.value,
    inputUri: inputUri.value,
  }
  submitting.value = true
  try {
    if (isEditMode.value && editUri.value) {
      await workflowStore.updateAtomicActivity(editUri.value, form)
      const uri = editUri.value
      reset()
      close()
      emit('updated', uri)
    } else {
      const uri = await workflowStore.addAtomicActivity(form)
      reset()
      close()
      emit('created', uri)
    }
  } catch (e) {
    submitError.value = 'Failed to save activity. Check the triple store is running.'
    console.error(e)
  } finally {
    submitting.value = false
  }
}

async function deleteActivity() {
  if (!editUri.value) return
  if (activityInUse.value) return
  if (!confirm(`Delete "${title.value}"? This cannot be undone.`)) return
  deleting.value = true
  try {
    await workflowStore.deleteAtomicActivity(editUri.value)
    const uri = editUri.value
    reset()
    close()
    emit('deleted', uri)
  } catch {
    submitError.value = 'Failed to delete activity. Check the triple store is running.'
    deleting.value = false
  }
}

reset()
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="act-modal-title">
        <div class="modal-header">
          <h2 id="act-modal-title">
            {{ isEditMode ? 'Edit Activity' : 'Add Activity' }}
          </h2>
          <button class="modal-close" aria-label="Close" @click="close">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="submit">
          <div class="field">
            <label for="act-title" class="field-label">
              Title <span class="required">*</span>
            </label>
            <input
              id="act-title"
              v-model="title"
              type="text"
              class="field-input"
              placeholder="e.g. CNC Machining"
              autocomplete="off"
            />
          </div>

          <div class="field">
            <label for="act-desc" class="field-label">Description</label>
            <textarea
              id="act-desc"
              v-model="description"
              class="field-input field-textarea"
              rows="2"
              placeholder="Brief description of this activity"
            />
          </div>

          <div class="field">
            <label for="act-sys" class="field-label">Implemented by (system)</label>
            <select id="act-sys" v-model="systemUri" class="field-input">
              <option value="">— None —</option>
              <option v-for="sys in systemOptions" :key="sys.uri" :value="sys.uri">
                {{ sys.title ?? sys.uri }}
              </option>
            </select>
            <p v-if="systemUri && systemOptions.find(s => s.uri === systemUri)?.description" class="field-hint">
              {{ systemOptions.find(s => s.uri === systemUri)!.description }}
            </p>
          </div>

          <div class="field">
            <label for="act-inp" class="field-label">Input</label>
            <select id="act-inp" v-model="inputUri" class="field-input">
              <option value="">— None —</option>
              <option v-for="inp in inputOptions" :key="inp.uri" :value="inp.uri">
                {{ inp.title ?? inp.uri }}
              </option>
            </select>
            <p v-if="inputUri && inputOptions.find(i => i.uri === inputUri)?.description" class="field-hint">
              {{ inputOptions.find(i => i.uri === inputUri)!.description }}
            </p>
          </div>

          <p v-if="submitError" class="error-msg">{{ submitError }}</p>

          <div class="modal-footer">
            <div v-if="isEditMode" class="delete-wrap">
              <button
                type="button"
                class="btn btn--danger"
                :disabled="deleting || submitting || activityInUse"
                :title="activityInUse ? 'Cannot delete: activity is used in a workflow model' : undefined"
                @click="deleteActivity"
              >
                {{ deleting ? 'Deleting…' : 'Delete' }}
              </button>
              <p v-if="activityInUse" class="in-use-msg">Used in a workflow — cannot delete</p>
            </div>
            <div class="footer-right">
              <button type="button" class="btn btn--secondary" @click="close">Cancel</button>
              <button type="submit" class="btn btn--primary" :disabled="submitting || deleting">
                {{ submitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create Activity' }}
              </button>
            </div>
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
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  width: min(480px, 94vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 1.4rem 0.9rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal-header h2 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: #6b7280;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  line-height: 1;
  font-family: inherit;
}

.modal-close:hover { background: #f3f4f6; }

.modal-body {
  padding: 1.25rem 1.4rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text);
}

.required { color: #dc2626; }

.field-input {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--color-text);
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.field-input:focus { border-color: var(--color-primary); }

.field-textarea { resize: vertical; }

.field-hint {
  font-size: 0.78rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
}

.error-msg {
  color: #dc2626;
  font-size: 0.875rem;
  margin: 0;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.4rem 1.1rem;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  gap: 0.75rem;
}

.footer-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.btn {
  padding: 0.5rem 1.1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}

.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
.btn--primary:not(:disabled):hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.btn--secondary {
  background: #fff;
  color: var(--color-text);
  border-color: var(--color-border);
}
.btn--secondary:hover { background: #f9fafb; }

.btn--danger {
  background: #fff;
  color: #dc2626;
  border-color: #fca5a5;
}
.btn--danger:not(:disabled):hover {
  background: #fee2e2;
  border-color: #dc2626;
}

.delete-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.in-use-msg {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0;
}
</style>

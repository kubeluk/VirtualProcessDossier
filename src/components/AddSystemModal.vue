<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  useWorkflowStore,
  type AtomicActivityOption,
  type SystemSummary,
  type SystemNodeType,
  type SystemNodeForm,
} from '@/stores/workflow'
import SystemNodeEditor, {
  type SystemNodeFormWithId,
  newSystemNodeWithId,
} from './SystemNodeEditor.vue'

const props = defineProps<{
  modelValue: boolean
  editSystem?: SystemSummary | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [uri: string]
  updated: [uri: string]
  deleted: [uri: string]
}>()

const workflowStore = useWorkflowStore()

// Root-level fields
const type = ref<SystemNodeType>('ssn:System')
const title = ref('')
const identifier = ref('')
const description = ref('')
const selectedActivityUris = ref<string[]>([])
const children = ref<SystemNodeFormWithId[]>([])

const activityOptions = ref<AtomicActivityOption[]>([])

const submitting = ref(false)
const deleting = ref(false)
const submitError = ref<string | null>(null)

const isEditMode = ref(false)
const editUri = ref<string | null>(null)

function close() {
  emit('update:modelValue', false)
}

function reset() {
  type.value = 'ssn:System'
  title.value = ''
  identifier.value = ''
  description.value = ''
  selectedActivityUris.value = []
  children.value = []
  submitError.value = null
  isEditMode.value = false
  editUri.value = null
}

function fromNodeSummary(node: { type: SystemNodeType; title: string | null; identifier: string | null; description: string | null; children: typeof node[] }): SystemNodeFormWithId {
  return newSystemNodeWithId({
    type: node.type,
    title: node.title ?? '',
    identifier: node.identifier ?? '',
    description: node.description ?? '',
    children: node.children.map(fromNodeSummary),
  })
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    activityOptions.value = await workflowStore.fetchAtomicActivityOptions()

    if (props.editSystem) {
      isEditMode.value = true
      editUri.value = props.editSystem.uri
      type.value = props.editSystem.type
      title.value = props.editSystem.title ?? ''
      identifier.value = props.editSystem.identifier ?? ''
      description.value = props.editSystem.description ?? ''
      selectedActivityUris.value = props.editSystem.implementedActivities.map((a) => a.uri)
      children.value = props.editSystem.children.map(fromNodeSummary)
      submitError.value = null
    } else {
      reset()
    }
  },
)

function toggleActivity(uri: string) {
  const idx = selectedActivityUris.value.indexOf(uri)
  if (idx === -1) {
    selectedActivityUris.value = [...selectedActivityUris.value, uri]
  } else {
    selectedActivityUris.value = selectedActivityUris.value.filter((u) => u !== uri)
  }
}

function addChild() {
  children.value.push(newSystemNodeWithId())
}

function removeChild(idx: number) {
  children.value.splice(idx, 1)
}

function toNodeForm(node: SystemNodeFormWithId): SystemNodeForm {
  return {
    type: node.type,
    title: node.title,
    identifier: node.identifier,
    description: node.description,
    children: node.children.map(toNodeForm),
  }
}

function validate(): string | null {
  if (!title.value.trim()) return 'Name is required.'
  if (!identifier.value.trim()) return 'Identifier is required.'
  for (const child of children.value) {
    const err = validateNode(child)
    if (err) return err
  }
  return null
}

function validateNode(node: SystemNodeFormWithId): string | null {
  if (!node.title.trim()) return `A sub-system is missing a name.`
  if (!node.identifier.trim()) return `A sub-system is missing an identifier.`
  for (const child of node.children) {
    const err = validateNode(child)
    if (err) return err
  }
  return null
}

async function submit() {
  submitError.value = validate()
  if (submitError.value) return

  const form = {
    type: type.value,
    title: title.value.trim(),
    identifier: identifier.value.trim(),
    description: description.value.trim(),
    activityUris: selectedActivityUris.value,
    children: children.value.map(toNodeForm),
  }
  submitting.value = true
  try {
    if (isEditMode.value && editUri.value) {
      await workflowStore.updateSystem(editUri.value, form)
      const uri = editUri.value
      reset()
      close()
      emit('updated', uri)
    } else {
      const uri = await workflowStore.addSystem(form)
      reset()
      close()
      emit('created', uri)
    }
  } catch (e) {
    submitError.value = 'Failed to save system. Check the triple store is running.'
    console.error(e)
  } finally {
    submitting.value = false
  }
}

async function deleteSystem() {
  if (!editUri.value) return
  if (!confirm(`Delete "${title.value}"? This cannot be undone.`)) return
  deleting.value = true
  try {
    await workflowStore.deleteSystem(editUri.value)
    const uri = editUri.value
    reset()
    close()
    emit('deleted', uri)
  } catch {
    submitError.value = 'Failed to delete system. Check the triple store is running.'
    deleting.value = false
  }
}

reset()
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="sys-modal-title">
        <div class="modal-header">
          <h2 id="sys-modal-title">
            {{ isEditMode ? 'Edit System' : 'Add System' }}
          </h2>
          <button class="modal-close" aria-label="Close" @click="close">✕</button>
        </div>

        <form class="modal-body" @submit.prevent="submit">

          <!-- Type selector for root -->
          <div class="field field--type">
            <span class="field-label">Type</span>
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="type" type="radio" value="ssn:System" />
                System
              </label>
              <label class="radio-label">
                <input v-model="type" type="radio" value="sosa:Sensor" />
                Sensor
              </label>
              <label class="radio-label">
                <input v-model="type" type="radio" value="sosa:Actuator" />
                Actuator
              </label>
            </div>
          </div>

          <div class="field">
            <label for="sys-title" class="field-label">
              Name <span class="required">*</span>
            </label>
            <input
              id="sys-title"
              v-model="title"
              type="text"
              class="field-input"
              placeholder="e.g. CNC Line A"
              autocomplete="off"
            />
          </div>

          <div class="field">
            <label for="sys-id" class="field-label">
              Identifier <span class="required">*</span>
            </label>
            <input
              id="sys-id"
              v-model="identifier"
              type="text"
              class="field-input"
              placeholder="e.g. cnc-line-a"
              autocomplete="off"
            />
            <p v-if="!isEditMode" class="field-hint">
              Short, unique ID used to form the resource URI (e.g. <code>cnc-line-a</code>).
            </p>
          </div>

          <div class="field">
            <label for="sys-desc" class="field-label">Description</label>
            <textarea
              id="sys-desc"
              v-model="description"
              class="field-input field-textarea"
              rows="2"
              placeholder="Brief description of this system"
            />
          </div>

          <!-- Sub-systems tree -->
          <div class="field">
            <span class="field-label">Sub-systems</span>
            <p class="field-hint">
              Describe the physical composition of this system using
              <code>ssn:hasSubSystem</code>. Each node can be a System, Sensor, or Actuator.
            </p>
            <div class="children-section">
              <SystemNodeEditor
                v-for="(child, i) in children"
                :key="child._id"
                :node="child"
                :depth="1"
                :label="`Sub-system ${i + 1}`"
                :can-remove="true"
                @remove="removeChild(i)"
              />
              <button type="button" class="add-child-btn" @click="addChild">
                + Add sub-system
              </button>
            </div>
          </div>

          <!-- Implements activities -->
          <div class="field">
            <span class="field-label">Implements activities</span>
            <p class="field-hint">Select the workflow activities this system executes.</p>
            <div v-if="activityOptions.length === 0" class="field-hint">
              No activities in the library yet.
            </div>
            <ul v-else class="activity-checklist">
              <li
                v-for="act in activityOptions"
                :key="act.uri"
                class="activity-check-item"
                :class="{ 'activity-check-item--selected': selectedActivityUris.includes(act.uri) }"
                @click="toggleActivity(act.uri)"
              >
                <span class="check-box">
                  <span v-if="selectedActivityUris.includes(act.uri)" class="check-tick">✓</span>
                </span>
                <span class="check-label">
                  <span class="check-title">{{ act.title ?? act.uri }}</span>
                  <span v-if="act.description" class="check-description">{{ act.description }}</span>
                </span>
              </li>
            </ul>
          </div>

          <p v-if="submitError" class="error-msg">{{ submitError }}</p>

          <div class="modal-footer">
            <div v-if="isEditMode" class="delete-wrap">
              <button
                type="button"
                class="btn btn--danger"
                :disabled="deleting || submitting"
                @click="deleteSystem"
              >
                {{ deleting ? 'Deleting…' : 'Delete' }}
              </button>
            </div>
            <div class="footer-right">
              <button type="button" class="btn btn--secondary" @click="close">Cancel</button>
              <button type="submit" class="btn btn--primary" :disabled="submitting || deleting">
                {{ submitting ? 'Saving…' : isEditMode ? 'Save Changes' : 'Create System' }}
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
  width: min(600px, 94vw);
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

.field-hint code {
  font-family: monospace;
  background: #f3f4f6;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

.field--type .radio-group {
  display: flex;
  gap: 1.1rem;
  flex-wrap: wrap;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.875rem;
  color: var(--color-text);
  cursor: pointer;
}

/* Sub-system children section */
.children-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 8px;
  padding: 0.75rem;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  margin-top: 0.25rem;
}

.add-child-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  align-self: flex-start;
}

.add-child-btn:hover { color: var(--color-primary-dark); }

/* Activity checklist */
.activity-checklist {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.activity-check-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: var(--color-text);
  transition: background 0.1s;
  user-select: none;
}

.activity-check-item:hover { background: #f9fafb; }
.activity-check-item--selected { background: #f0fdf4; }

.check-box {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--color-border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #fff;
  transition: border-color 0.1s, background 0.1s;
}

.activity-check-item--selected .check-box {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.check-tick {
  font-size: 0.65rem;
  color: #fff;
  line-height: 1;
}

.check-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.check-title {
  font-size: 0.875rem;
  color: var(--color-text);
  line-height: 1.3;
}

.check-description {
  font-size: 0.75rem;
  color: #6b7280;
  line-height: 1.3;
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

.delete-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
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
</style>

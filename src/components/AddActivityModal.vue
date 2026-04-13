<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  useWorkflowStore,
  QUDT_UNIT_OPTIONS,
  type AtomicActivityForm,
  type AtomicActivitySummary,
  type ParameterPropertyShape,
  type ParameterPropertyShapeForm,
  type ProcedureOption,
} from '@/stores/workflow'

const VPD_BASE = 'https://example.org/vpd#'

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

const paramForms = ref<ParameterPropertyShapeForm[]>([])
const loadingShape = ref(false)
const hadShape = ref(false)  // tracks whether the activity had a shape when opened

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
  paramForms.value = []
  hadShape.value = false
  submitError.value = null
  isEditMode.value = false
  editUri.value = null
  activityInUse.value = false
}

function propShapeToForm(p: ParameterPropertyShape): ParameterPropertyShapeForm {
  const localName = p.path.startsWith(VPD_BASE) ? p.path.slice(VPD_BASE.length) : p.path
  const dtMap: Record<string, ParameterPropertyShapeForm['datatype']> = {
    'http://www.w3.org/2001/XMLSchema#decimal': 'xsd:decimal',
    'http://www.w3.org/2001/XMLSchema#integer': 'xsd:integer',
    'http://www.w3.org/2001/XMLSchema#string': 'xsd:string',
  }
  return {
    propShapeUri: p.propShapeUri,
    pathLocalName: localName,
    name: p.name ?? '',
    description: p.description ?? '',
    datatype: (p.datatype ? (dtMap[p.datatype] ?? 'xsd:decimal') : 'xsd:decimal'),
    minCount: (p.minCount ?? 0) >= 1 ? 1 : 0,
    maxCount: p.maxCount,
    minInclusive: p.minInclusive !== null ? String(p.minInclusive) : '',
    maxInclusive: p.maxInclusive !== null ? String(p.maxInclusive) : '',
    order: p.order ?? paramForms.value.length + 1,
    unitUri: p.unitUri ?? '',
  }
}

function addParameterRow() {
  paramForms.value.push({
    propShapeUri: null,
    pathLocalName: '',
    name: '',
    description: '',
    datatype: 'xsd:decimal',
    minCount: 0,
    maxCount: 1,
    minInclusive: '',
    maxInclusive: '',
    order: paramForms.value.length + 1,
    unitUri: '',
  })
}

function removeParameterRow(index: number) {
  paramForms.value.splice(index, 1)
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

      loadingShape.value = true
      const shape = await workflowStore.fetchParameterShape(props.editActivity.uri)
      paramForms.value = shape ? shape.properties.map(propShapeToForm) : []
      hadShape.value = shape !== null
      loadingShape.value = false
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
  // Validate parameter rows
  const seenPaths = new Set<string>()
  for (const pf of paramForms.value) {
    if (!pf.name.trim() || !pf.pathLocalName.trim()) {
      submitError.value = 'Each parameter must have a label and a path local name.'
      return
    }
    if (seenPaths.has(pf.pathLocalName.trim())) {
      submitError.value = `Duplicate parameter path "${pf.pathLocalName.trim()}".`
      return
    }
    seenPaths.add(pf.pathLocalName.trim())
  }

  const form: AtomicActivityForm = {
    title: title.value.trim(),
    description: description.value.trim(),
    systemUri: systemUri.value,
    inputUri: inputUri.value,
    parameterShapeForms: paramForms.value,
  }
  submitting.value = true
  try {
    let uri: string
    if (isEditMode.value && editUri.value) {
      await workflowStore.updateAtomicActivity(editUri.value, form)
      uri = editUri.value
    } else {
      uri = await workflowStore.addAtomicActivity(form)
    }

    // Manage parameter shape
    if (paramForms.value.length > 0) {
      await workflowStore.upsertParameterShape(uri, paramForms.value)
    } else if (hadShape.value && isEditMode.value) {
      await workflowStore.deleteParameterShape(uri)
    }

    reset()
    close()
    if (isEditMode.value) {
      emit('updated', uri)
    } else {
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
    // Clean up parameter shape before deleting the activity
    if (hadShape.value) {
      await workflowStore.deleteParameterShape(editUri.value)
    }
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

          <!-- Process Parameters -->
          <div class="field">
            <div class="param-section-header">
              <label class="field-label">Process Parameters</label>
              <button type="button" class="btn btn--secondary btn--small" @click="addParameterRow">
                + Add parameter
              </button>
            </div>
            <p v-if="loadingShape" class="field-hint">Loading…</p>
            <p v-else-if="paramForms.length === 0" class="field-hint">No parameters defined.</p>
            <div v-for="(pf, idx) in paramForms" :key="idx" class="param-row">
              <div class="param-row-main">
                <input
                  v-model="pf.name"
                  type="text"
                  class="field-input"
                  placeholder="Label (e.g. Closing Speed)"
                />
                <input
                  v-model="pf.pathLocalName"
                  type="text"
                  class="field-input field-input--mono"
                  placeholder="Path name (e.g. closingSpeed)"
                />
                <select v-model="pf.datatype" class="field-input field-input--narrow">
                  <option value="xsd:decimal">Decimal</option>
                  <option value="xsd:integer">Integer</option>
                  <option value="xsd:string">Text</option>
                </select>
                <select v-model="pf.unitUri" class="field-input field-input--narrow">
                  <option value="">— No unit —</option>
                  <option v-for="[uri, label] in QUDT_UNIT_OPTIONS" :key="uri" :value="uri">
                    {{ label }}
                  </option>
                </select>
                <button
                  type="button"
                  class="btn btn--danger btn--small param-remove"
                  :aria-label="`Remove parameter ${idx + 1}`"
                  @click="removeParameterRow(idx)"
                >
                  ✕
                </button>
              </div>
              <div class="param-row-extra">
                <label class="param-check-label">
                  <input
                    type="checkbox"
                    :checked="pf.minCount === 1"
                    @change="pf.minCount = ($event.target as HTMLInputElement).checked ? 1 : 0"
                  />
                  Required
                </label>
                <template v-if="pf.datatype !== 'xsd:string'">
                  <input
                    v-model="pf.minInclusive"
                    type="number"
                    class="field-input field-input--tiny"
                    placeholder="Min"
                  />
                  <input
                    v-model="pf.maxInclusive"
                    type="number"
                    class="field-input field-input--tiny"
                    placeholder="Max"
                  />
                </template>
                <input
                  v-model.number="pf.order"
                  type="number"
                  class="field-input field-input--tiny"
                  placeholder="Order"
                />
              </div>
            </div>
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
  width: min(640px, 94vw);
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

.btn--small {
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
}

.param-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.param-row {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  background: #fafafa;
}

.param-row-main {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
}

.param-row-extra {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.field-input--narrow {
  width: auto;
  flex: 0 1 120px;
}

.field-input--tiny {
  width: 5rem;
  flex: 0 0 auto;
}

.field-input--mono {
  font-family: monospace;
  font-size: 0.8rem;
}

.param-check-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  color: var(--color-text);
  white-space: nowrap;
  cursor: pointer;
}

.param-remove {
  flex-shrink: 0;
  margin-left: auto;
}
</style>

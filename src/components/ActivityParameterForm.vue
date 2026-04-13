<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWorkflowStore, type RunActivityInstance, type ParameterShape } from '@/stores/workflow'

const props = defineProps<{
  inst: RunActivityInstance
  shape: ParameterShape
  initialValues: Record<string, string>
}>()

const emit = defineEmits<{
  saved: [values: Record<string, string>]
}>()

const workflowStore = useWorkflowStore()

// Vue 3 v-model on type="number" inputs coerces values to numbers at runtime,
// so we use string | number here even though initialValues are always strings.
const fieldValues = ref<Record<string, string | number>>({})
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)

onMounted(() => {
  for (const prop of props.shape.properties) {
    fieldValues.value[prop.path] = props.initialValues[prop.path] ?? ''
  }
})

const formFields = computed(() =>
  [...props.shape.properties]
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .map((p) => ({
      ...p,
      widget: p.datatype === 'http://www.w3.org/2001/XMLSchema#string' ? 'text' : 'number',
      isRequired: (p.minCount ?? 0) >= 1,
      step:
        p.datatype === 'http://www.w3.org/2001/XMLSchema#integer' ? '1' : 'any',
    })),
)

function validate(): string | null {
  for (const f of formFields.value) {
    const val = String(fieldValues.value[f.path] ?? '').trim()
    if (f.isRequired && !val) {
      return `"${f.name ?? f.path}" is required.`
    }
    if (f.widget === 'number' && val) {
      const n = Number(val)
      if (isNaN(n)) return `"${f.name ?? f.path}" must be a number.`
      if (f.minInclusive !== null && n < f.minInclusive)
        return `"${f.name ?? f.path}" must be ≥ ${f.minInclusive}.`
      if (f.maxInclusive !== null && n > f.maxInclusive)
        return `"${f.name ?? f.path}" must be ≤ ${f.maxInclusive}.`
    }
  }
  return null
}

async function save() {
  saveError.value = validate()
  if (saveError.value) return
  saving.value = true
  saveSuccess.value = false
  try {
    // Stringify all values — v-model on number inputs coerces to number at runtime
    const serialized: Record<string, string> = Object.fromEntries(
      Object.entries(fieldValues.value).map(([k, v]) => [k, String(v)]),
    )
    await workflowStore.saveParameterValues(props.inst.uri, props.shape, serialized)
    saveSuccess.value = true
    emit('saved', serialized)
  } catch {
    saveError.value = 'Failed to save parameters.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="param-form">
    <h4 class="param-form-title">Process Parameters</h4>
    <div v-for="f in formFields" :key="f.path" class="param-field">
      <label :for="`pf-${f.propShapeUri}`" class="param-label">
        {{ f.name ?? f.path }}
        <span v-if="f.isRequired" class="param-required">*</span>
      </label>
      <div class="param-input-wrap">
        <input
          :id="`pf-${f.propShapeUri}`"
          v-model="fieldValues[f.path]"
          :type="f.widget"
          :min="f.minInclusive !== null ? f.minInclusive : undefined"
          :max="f.maxInclusive !== null ? f.maxInclusive : undefined"
          :step="f.step"
          class="param-input"
          :placeholder="f.description ?? undefined"
        />
        <span v-if="f.unitLabel" class="param-unit">{{ f.unitLabel }}</span>
      </div>
      <p v-if="f.description" class="param-desc">{{ f.description }}</p>
    </div>
    <p v-if="saveError" class="param-error">{{ saveError }}</p>
    <div class="param-actions">
      <button
        type="button"
        class="param-save-btn"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save parameters' }}
      </button>
      <span v-if="saveSuccess" class="param-success">Saved</span>
    </div>
  </div>
</template>

<style scoped>
.param-form {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.param-form-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.25rem;
}

.param-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.param-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text);
}

.param-required {
  color: #dc2626;
  margin-left: 0.15rem;
}

.param-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.param-input {
  border: 1px solid var(--color-border);
  border-radius: 5px;
  padding: 0.35rem 0.6rem;
  font-size: 0.85rem;
  font-family: inherit;
  color: var(--color-text);
  background: #fff;
  outline: none;
  flex: 1;
  min-width: 0;
  transition: border-color 0.15s;
}

.param-input:focus {
  border-color: var(--color-primary);
}

.param-unit {
  font-size: 0.8rem;
  color: #6b7280;
  white-space: nowrap;
  flex-shrink: 0;
}

.param-desc {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0;
}

.param-error {
  color: #dc2626;
  font-size: 0.8rem;
  margin: 0;
}

.param-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.param-save-btn {
  padding: 0.35rem 0.9rem;
  border-radius: 5px;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  transition: background 0.15s;
}

.param-save-btn:not(:disabled):hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.param-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.param-success {
  font-size: 0.8rem;
  color: #166534;
  font-weight: 500;
}
</style>

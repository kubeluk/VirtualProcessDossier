<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useLaminateStore, type LaminateSummary } from '@/stores/laminate'
import { validateLaminate, type LaminateForm } from '@/services/laminate'

const props = defineProps<{ laminate: LaminateSummary | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const store = useLaminateStore()
const dialog = ref<HTMLDialogElement>()
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const inUse = ref(false)
const loadFailed = ref(false)
const form = ref<LaminateForm>({
  label: '',
  identifier: '',
  length: 400,
  width: 400,
  thickness: 1.56,
  layupLabel: '',
  plies: [{ polymer: '', fiberType: '', massFraction: 60, orientation: 0 }],
  points: [],
})
const dimensions = ['length', 'width', 'thickness'] as const

onMounted(async () => {
  dialog.value?.showModal()
  if (!props.laminate) return
  loading.value = true
  try {
    const [data, used] = await Promise.all([
      store.fetchLaminate(props.laminate.uri),
      store.isInUse(props.laminate.uri),
    ])
    form.value = data
    inUse.value = used
  } catch (e) {
    loadFailed.value = true
    error.value = e instanceof Error ? e.message : 'Failed to load laminate.'
  } finally {
    loading.value = false
  }
})

function movePly(index: number, offset: number) {
  const rows = form.value.plies
  ;[rows[index], rows[index + offset]] = [rows[index + offset], rows[index]]
}

async function save() {
  error.value = ''
  try {
    validateLaminate(form.value)
    busy.value = true
    await store.saveLaminate(form.value, props.laminate?.uri)
    emit('saved')
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Failed to save laminate. Check the triple store connection.'
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (
    !props.laminate ||
    inUse.value ||
    !confirm(`Delete “${form.value.label}”? This cannot be undone.`)
  )
    return
  busy.value = true
  error.value = ''
  try {
    await store.deleteLaminate(props.laminate.uri)
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to delete laminate.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" aria-labelledby="laminate-title" @cancel.prevent="!busy && emit('close')">
    <header>
      <h2 id="laminate-title">{{ laminate ? 'Laminate details' : 'Create Laminate' }}</h2>
      <button type="button" :disabled="busy" aria-label="Close" @click="emit('close')">✕</button>
    </header>
    <p v-if="loading" role="status">Loading laminate…</p>
    <form v-else @submit.prevent="save">
      <fieldset :disabled="busy || loadFailed">
        <p
          v-if="laminate && (!form.identifier || dimensions.some((d) => form[d] === null))"
          class="hint"
          role="status"
        >
          Some required values are missing. Fill in the identifier and all dimensions before saving.
        </p>
        <div class="columns">
          <label>Name<input v-model="form.label" required /></label>
          <label>Identifier<input v-model="form.identifier" required /></label>
        </div>
        <div class="columns">
          <label v-for="dimension in dimensions" :key="dimension" class="dimension">
            {{ dimension }} (mm)
            <input v-model.number="form[dimension]" type="number" step="any" min="0" required />
          </label>
        </div>
        <h3>Ply stack</h3>
        <label>Layup name<input v-model="form.layupLabel" placeholder="e.g. [0/60/120]s" /></label>
        <p class="hint">Plies are listed in stack order. Each row represents a distinct tape.</p>
        <div v-for="(ply, index) in form.plies" :key="index" class="row-card">
          <div class="row-actions">
            <strong>Ply {{ index + 1 }}</strong>
            <button
              type="button"
              :disabled="index === 0"
              :aria-label="`Move ply ${index + 1} up`"
              @click="movePly(index, -1)"
            >
              ↑
            </button>
            <button
              type="button"
              :disabled="index === form.plies.length - 1"
              :aria-label="`Move ply ${index + 1} down`"
              @click="movePly(index, 1)"
            >
              ↓
            </button>
            <button
              type="button"
              :disabled="form.plies.length === 1"
              @click="form.plies.splice(index, 1)"
            >
              Remove
            </button>
          </div>
          <div class="columns">
            <label>Polymer<input v-model="ply.polymer" placeholder="PA6" required /></label>
            <label>Fiber type<input v-model="ply.fiberType" placeholder="GF" required /></label>
            <label
              >Fiber mass (%)<input
                v-model.number="ply.massFraction"
                type="number"
                min="0"
                max="100"
                step="any"
                required
            /></label>
            <label
              >Orientation (°)<input
                v-model.number="ply.orientation"
                type="number"
                step="any"
                required
            /></label>
          </div>
        </div>
        <button
          type="button"
          @click="form.plies.push({ polymer: '', fiberType: '', massFraction: 60, orientation: 0 })"
        >
          + Add ply
        </button>
        <h3>
          Needle points <small>({{ form.points.length }}/12)</small>
        </h3>
        <p class="hint">
          Coordinates are in millimetres relative to the laminate reference point (normally its
          centre).
        </p>
        <p v-if="!form.points.length" class="hint">No needle points.</p>
        <div v-for="(point, index) in form.points" :key="index" class="row-card">
          <div class="row-actions">
            <strong>Point {{ index + 1 }}</strong
            ><button type="button" @click="form.points.splice(index, 1)">Remove</button>
          </div>
          <div class="columns">
            <label
              >X (mm)<input v-model.number="point.x" type="number" step="any" required
            /></label>
            <label
              >Y (mm)<input v-model.number="point.y" type="number" step="any" required
            /></label>
          </div>
          <p class="hint">Reference: {{ point.referenceLabel || 'Laminate Reference Point' }}</p>
        </div>
        <button
          type="button"
          :disabled="form.points.length >= 12"
          @click="form.points.push({ x: 0, y: 0, referenceLabel: 'Laminate Reference Point' })"
        >
          + Add needle point
        </button>
      </fieldset>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <footer>
        <div v-if="laminate">
          <button
            type="button"
            class="danger"
            :disabled="busy || loading || loadFailed || inUse"
            @click="remove"
          >
            Delete
          </button>
          <p v-if="inUse" class="hint">Referenced by another record; deletion is disabled.</p>
        </div>
        <div class="row-actions">
          <button type="button" :disabled="busy" @click="emit('close')">Cancel</button>
          <button type="submit" class="primary" :disabled="busy || loading || loadFailed">
            {{ busy ? 'Saving…' : laminate ? 'Save Changes' : 'Create Laminate' }}
          </button>
        </div>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
dialog {
  margin: auto;
  width: min(820px, 94vw);
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  color: var(--color-text);
  background: var(--color-surface);
}
dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
header,
footer,
.row-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
header {
  margin-bottom: 1.25rem;
}
h2 {
  font-size: 1.25rem;
}
h3 {
  margin: 1.25rem 0 0.6rem;
}
small,
.hint {
  color: #6b7280;
  font-size: 0.8rem;
  font-weight: normal;
}
.hint {
  margin: 0.5rem 0;
}
fieldset {
  border: 0;
  padding: 0;
  min-width: 0;
}
.columns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
label {
  display: flex;
  flex: 1 1 130px;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.dimension {
  text-transform: capitalize;
}
input {
  width: 100%;
  min-width: 0;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font: inherit;
}
button {
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: white;
  color: var(--color-text);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.primary {
  background: var(--color-primary);
  color: white;
}
.danger,
.error {
  color: #dc2626;
}
.error {
  margin-top: 1rem;
}
.row-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin: 0.75rem 0;
}
.row-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.row-actions strong {
  margin-right: auto;
}
footer {
  flex-wrap: wrap;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
}
</style>

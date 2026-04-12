<script lang="ts">
// Module-level exports — consumed by AddWorkflowModal.vue
export interface StepFormWithId {
  id: number
  uri?: string
  title: string
  description: string
  type: 'AtomicActivity' | 'ParallelActivity' | 'SequentialActivity'
  systemUri: string  // '' means none
  inputUri: string   // '' means none
  isLibraryRef: boolean
  children: StepFormWithId[]
}

let _nextId = 0
export function newStepWithId(
  overrides: Partial<Omit<StepFormWithId, 'id' | 'children'>> & { children?: StepFormWithId[] } = {},
): StepFormWithId {
  return {
    id: _nextId++,
    title: '',
    description: '',
    type: 'AtomicActivity',
    systemUri: '',
    inputUri: '',
    isLibraryRef: false,
    children: [],
    ...overrides,
  }
}
</script>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ProcedureOption, AtomicActivityOption } from '@/stores/workflow'
import StepEditorNode from './StepEditorNode.vue'

const props = defineProps<{
  step: StepFormWithId
  depth: number
  stepNum: number | null  // 1-based for top-level steps; null for sub-nodes
  canRemove: boolean
  metadataOnly: boolean
  systemOptions: ProcedureOption[]
  inputOptions: ProcedureOption[]
  activityOptions: AtomicActivityOption[]
}>()

defineEmits<{ remove: [] }>()

const isComposite = computed(() => props.step.type !== 'AtomicActivity')

const typeLabel = computed(() => {
  if (props.step.type === 'ParallelActivity') return '⟷ parallel'
  if (props.step.type === 'SequentialActivity') return '↕ sequential'
  return 'single'
})

const childrenClass = computed(() =>
  props.step.type === 'ParallelActivity' ? 'children--parallel' : 'children--sequential',
)

// Auto-expand details section when the step already has a system or input linked
const detailsOpen = ref(!!(props.step.systemUri || props.step.inputUri))

// Selected library activity URI for the picker ('' = new inline activity)
const selectedLibraryUri = computed({
  get: () => (props.step.isLibraryRef && props.step.uri) ? props.step.uri : '',
  set: (val: string) => {
    if (!val) {
      props.step.isLibraryRef = false
      props.step.uri = undefined
      props.step.title = ''
      props.step.description = ''
      props.step.systemUri = ''
      props.step.inputUri = ''
    } else {
      const opt = props.activityOptions.find((a) => a.uri === val)
      if (opt) {
        props.step.isLibraryRef = true
        props.step.uri = opt.uri
        props.step.title = opt.title ?? ''
        props.step.description = opt.description ?? ''
        props.step.systemUri = opt.systemUri ?? ''
        props.step.inputUri = opt.inputUri ?? ''
      }
    }
  },
})

function onTypeChange() {
  if (props.step.type === 'AtomicActivity') {
    props.step.children.splice(0)
    props.step.isLibraryRef = false
  } else if (props.step.children.length === 0) {
    props.step.children.push(newStepWithId(), newStepWithId())
    props.step.isLibraryRef = false
  }
}

function addChild() {
  props.step.children.push(newStepWithId())
}

function removeChild(idx: number) {
  props.step.children.splice(idx, 1)
}

const minChildren = computed(() =>
  props.step.type === 'ParallelActivity' ? 2 : 1,
)
</script>

<template>
  <div class="step-node" :class="`step-node--depth-${Math.min(depth, 3)}`">
    <!-- Node header row -->
    <div class="node-header">
      <span class="node-label">
        {{ stepNum !== null ? `Step ${stepNum}` : 'Sub-activity' }}
      </span>
      <span v-if="metadataOnly" class="type-badge" :class="`type-badge--${step.type.toLowerCase().replace('activity', '')}`">
        {{ typeLabel }}
      </span>
      <button
        v-if="!metadataOnly && canRemove"
        type="button"
        class="remove-btn"
        @click="$emit('remove')"
      >
        Remove
      </button>
    </div>

    <!-- Library activity picker (atomic steps in create/edit mode) -->
    <div v-if="step.type === 'AtomicActivity' && !metadataOnly" class="field">
      <label :for="`st-lib-${step.id}`" class="field-label">From activity library</label>
      <select
        :id="`st-lib-${step.id}`"
        v-model="selectedLibraryUri"
        class="field-input"
      >
        <option value="">— Define new activity —</option>
        <option v-for="act in activityOptions" :key="act.uri" :value="act.uri">
          {{ act.title ?? act.uri }}
        </option>
      </select>
      <p v-if="step.isLibraryRef" class="field-hint lib-ref-hint">
        Linked from activity library. Edit in the Activity Library view.
      </p>
    </div>

    <!-- Title -->
    <div class="field">
      <label :for="`st-title-${step.id}`" class="field-label">
        Title <span v-if="!step.isLibraryRef" class="required">*</span>
      </label>
      <input
        :id="`st-title-${step.id}`"
        v-model="step.title"
        type="text"
        class="field-input"
        :placeholder="stepNum !== null ? 'e.g. Material Preparation' : 'Sub-activity name'"
        :disabled="step.isLibraryRef"
        autocomplete="off"
      />
    </div>

    <!-- Description -->
    <div class="field">
      <label :for="`st-desc-${step.id}`" class="field-label">Description</label>
      <input
        :id="`st-desc-${step.id}`"
        v-model="step.description"
        type="text"
        class="field-input"
        placeholder="Optional description"
        :disabled="step.isLibraryRef"
        autocomplete="off"
      />
    </div>

    <!-- Type selection (create/edit mode only) -->
    <div v-if="!metadataOnly" class="field field--type">
      <span class="field-label">Type</span>
      <div class="radio-group">
        <label class="radio-label">
          <input v-model="step.type" type="radio" value="AtomicActivity" @change="onTypeChange" />
          Single (atomic)
        </label>
        <label class="radio-label">
          <input v-model="step.type" type="radio" value="ParallelActivity" @change="onTypeChange" />
          Parallel
        </label>
        <label class="radio-label">
          <input v-model="step.type" type="radio" value="SequentialActivity" @change="onTypeChange" />
          Sequential
        </label>
      </div>
    </div>

    <!-- System & Input (atomic activities only, hidden for library refs) -->
    <div v-if="step.type === 'AtomicActivity' && !step.isLibraryRef" class="details-section">
      <button type="button" class="details-toggle" @click="detailsOpen = !detailsOpen">
        {{ detailsOpen ? '▾' : '▸' }} System &amp; input
      </button>
      <div v-if="detailsOpen" class="details-body">
        <div class="field">
          <label :for="`st-sys-${step.id}`" class="field-label">Implemented by (system)</label>
          <select :id="`st-sys-${step.id}`" v-model="step.systemUri" class="field-input">
            <option value="">— None —</option>
            <option v-for="sys in systemOptions" :key="sys.uri" :value="sys.uri">
              {{ sys.title ?? sys.uri }}
            </option>
          </select>
          <p v-if="step.systemUri && systemOptions.find(s => s.uri === step.systemUri)?.description" class="field-hint">
            {{ systemOptions.find(s => s.uri === step.systemUri)!.description }}
          </p>
        </div>
        <div class="field">
          <label :for="`st-inp-${step.id}`" class="field-label">Input</label>
          <select :id="`st-inp-${step.id}`" v-model="step.inputUri" class="field-input">
            <option value="">— None —</option>
            <option v-for="inp in inputOptions" :key="inp.uri" :value="inp.uri">
              {{ inp.title ?? inp.uri }}
            </option>
          </select>
          <p v-if="step.inputUri && inputOptions.find(i => i.uri === step.inputUri)?.description" class="field-hint">
            {{ inputOptions.find(i => i.uri === step.inputUri)!.description }}
          </p>
        </div>
      </div>
    </div>

    <!-- Children (composite activities) -->
    <div v-if="isComposite" class="children-section" :class="childrenClass">
      <div class="children-label">
        {{ step.type === 'ParallelActivity' ? 'Parallel branches:' : 'Sequential sub-activities:' }}
      </div>

      <StepEditorNode
        v-for="(child, i) in step.children"
        :key="child.id"
        :step="child"
        :depth="depth + 1"
        :step-num="null"
        :can-remove="step.children.length > minChildren"
        :metadata-only="metadataOnly"
        :system-options="systemOptions"
        :input-options="inputOptions"
        :activity-options="activityOptions"
        @remove="removeChild(i)"
      />

      <button v-if="!metadataOnly" type="button" class="add-child-btn" @click="addChild">
        + Add sub-activity
      </button>
    </div>
  </div>
</template>

<style scoped>
.step-node {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.875rem;
  background: #fafafa;
}

.step-node--depth-1 { background: #f5f7ff; border-color: #c7d2fe; }
.step-node--depth-2 { background: #f0fdf4; border-color: #bbf7d0; }
.step-node--depth-3 { background: #fefce8; border-color: #fde68a; }

.node-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.1rem;
}

.node-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  flex: 1;
}

.type-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 20px;
}

.type-badge--atomic { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
.type-badge--parallel { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
.type-badge--sequential { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.remove-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 0.15rem 0.55rem;
  font-size: 0.78rem;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: #fee2e2;
  color: #dc2626;
  border-color: #fca5a5;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.field-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-text);
}

.required { color: #dc2626; }

.field-input {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.45rem 0.7rem;
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

.field-hint {
  font-size: 0.78rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.4;
}

.lib-ref-hint {
  color: #7c3aed;
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
  font-size: 0.85rem;
  color: var(--color-text);
  cursor: pointer;
}

/* Details (system & input) accordion */
.details-section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.details-toggle {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  align-self: flex-start;
  line-height: 1.4;
}

.details-toggle:hover { color: var(--color-primary-dark); }

.details-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  background: #f8faff;
  border: 1px solid #e0e7ff;
  border-radius: 6px;
}

/* Children clusters */
.children-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 6px;
  padding: 0.75rem;
  margin-top: 0.1rem;
}

.children--parallel {
  background: #f0f4ff;
  border: 1px solid #c7d2fe;
}

.children--sequential {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.children-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 0.1rem;
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
  margin-top: 0.1rem;
}

.add-child-btn:hover { color: var(--color-primary-dark); }
</style>

<script lang="ts">
// Module-level exports — consumed by AddSystemModal.vue
import type { SystemNodeType } from '@/stores/workflow'

export interface SystemNodeFormWithId {
  _id: number
  uri?: string           // existing URI when loaded for edit
  type: SystemNodeType
  title: string
  identifier: string
  description: string
  children: SystemNodeFormWithId[]
}

let _nextId = 0
export function newSystemNodeWithId(
  overrides: Partial<Omit<SystemNodeFormWithId, '_id' | 'children'>> & { children?: SystemNodeFormWithId[] } = {},
): SystemNodeFormWithId {
  return {
    _id: _nextId++,
    type: 'ssn:System',
    title: '',
    identifier: '',
    description: '',
    children: [],
    ...overrides,
  }
}
</script>

<script setup lang="ts">
import SystemNodeEditor from './SystemNodeEditor.vue'

const props = defineProps<{
  node: SystemNodeFormWithId
  depth: number
  label: string        // e.g. "Sub-system 1" or "Root"
  canRemove: boolean
}>()

defineEmits<{ remove: [] }>()

function addChild() {
  props.node.children.push(newSystemNodeWithId())
}

function removeChild(idx: number) {
  props.node.children.splice(idx, 1)
}
</script>

<template>
  <div class="sys-node" :class="`sys-node--depth-${Math.min(depth, 3)}`">
    <!-- Header row -->
    <div class="node-header">
      <span class="node-label">{{ label }}</span>
      <button
        v-if="canRemove"
        type="button"
        class="remove-btn"
        @click="$emit('remove')"
      >
        Remove
      </button>
    </div>

    <!-- Type selector -->
    <div class="field field--type">
      <span class="field-label">Type</span>
      <div class="radio-group">
        <label class="radio-label">
          <input v-model="node.type" type="radio" value="ssn:System" />
          System
        </label>
        <label class="radio-label">
          <input v-model="node.type" type="radio" value="sosa:Sensor" />
          Sensor
        </label>
        <label class="radio-label">
          <input v-model="node.type" type="radio" value="sosa:Actuator" />
          Actuator
        </label>
      </div>
    </div>

    <!-- Title -->
    <div class="field">
      <label :for="`sn-title-${node._id}`" class="field-label">
        Name <span class="required">*</span>
      </label>
      <input
        :id="`sn-title-${node._id}`"
        v-model="node.title"
        type="text"
        class="field-input"
        placeholder="e.g. Temperature Sensor A"
        autocomplete="off"
      />
    </div>

    <!-- Identifier -->
    <div class="field">
      <label :for="`sn-id-${node._id}`" class="field-label">
        Identifier <span class="required">*</span>
      </label>
      <input
        :id="`sn-id-${node._id}`"
        v-model="node.identifier"
        type="text"
        class="field-input"
        placeholder="e.g. temp-sensor-a"
        autocomplete="off"
      />
    </div>

    <!-- Description -->
    <div class="field">
      <label :for="`sn-desc-${node._id}`" class="field-label">Description</label>
      <input
        :id="`sn-desc-${node._id}`"
        v-model="node.description"
        type="text"
        class="field-input"
        placeholder="Optional description"
        autocomplete="off"
      />
    </div>

    <!-- Sub-systems -->
    <div class="children-section">
      <div class="children-label">Sub-systems</div>
      <SystemNodeEditor
        v-for="(child, i) in node.children"
        :key="child._id"
        :node="child"
        :depth="depth + 1"
        :label="`Sub-system ${i + 1}`"
        :can-remove="true"
        @remove="removeChild(i)"
      />
      <button type="button" class="add-child-btn" @click="addChild">
        + Add sub-system
      </button>
    </div>
  </div>
</template>

<style scoped>
.sys-node {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.875rem;
  background: #fafafa;
}

.sys-node--depth-1 { background: #f5f7ff; border-color: #c7d2fe; }
.sys-node--depth-2 { background: #f0fdf4; border-color: #bbf7d0; }
.sys-node--depth-3 { background: #fefce8; border-color: #fde68a; }

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

.children-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-radius: 6px;
  padding: 0.75rem;
  margin-top: 0.1rem;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
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

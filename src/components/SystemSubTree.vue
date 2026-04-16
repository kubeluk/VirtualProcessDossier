<script setup lang="ts">
import { ref } from 'vue'
import type { SystemNodeSummary, SystemNodeType } from '@/stores/workflow'
import SystemSubTree from './SystemSubTree.vue'

defineProps<{
  nodes: SystemNodeSummary[]
  depth?: number
}>()

function typeLabel(t: SystemNodeType): string {
  if (t === 'sosa:Sensor') return 'Sensor'
  if (t === 'sosa:Actuator') return 'Actuator'
  return 'System'
}

const collapsed = ref<Set<string>>(new Set())

function toggle(uri: string) {
  if (collapsed.value.has(uri)) {
    collapsed.value.delete(uri)
  } else {
    collapsed.value.add(uri)
  }
  // trigger reactivity
  collapsed.value = new Set(collapsed.value)
}
</script>

<template>
  <ul class="subtree" :class="depth === 0 ? 'subtree--root' : 'subtree--nested'">
    <li
      v-for="(node, i) in nodes"
      :key="node.uri"
      class="subtree-item"
      :class="{ 'subtree-item--last': i === nodes.length - 1 }"
    >
      <div class="subtree-row">
        <span class="tree-connector" aria-hidden="true">
          {{ i === nodes.length - 1 ? '└─' : '├─' }}
        </span>
        <button
          v-if="node.children.length > 0"
          type="button"
          class="collapse-btn"
          :aria-label="collapsed.has(node.uri) ? 'Expand' : 'Collapse'"
          @click="toggle(node.uri)"
        >
          {{ collapsed.has(node.uri) ? '▶' : '▼' }}
        </button>
        <span v-else class="collapse-spacer" aria-hidden="true" />
        <span class="type-badge" :class="`type-badge--${node.type.split(':')[1].toLowerCase()}`">
          {{ typeLabel(node.type) }}
        </span>
        <span class="node-title">{{ node.title ?? node.uri }}</span>
        <span v-if="node.identifier" class="node-id">{{ node.identifier }}</span>
      </div>
      <p v-if="node.description && !collapsed.has(node.uri)" class="node-desc">
        {{ node.description }}
      </p>
      <SystemSubTree
        v-if="node.children.length > 0 && !collapsed.has(node.uri)"
        :nodes="node.children"
        :depth="(depth ?? 0) + 1"
      />
    </li>
  </ul>
</template>

<style scoped>
.subtree {
  list-style: none;
  padding: 0;
  margin: 0;
}

.subtree--root {
  margin-top: 0.75rem;
}

.subtree--nested {
  padding-left: 1.5rem;
}

.subtree-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.subtree-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 1.75rem;
}

.tree-connector {
  font-family: monospace;
  font-size: 0.8rem;
  color: #d1d5db;
  flex-shrink: 0;
  user-select: none;
}

.collapse-btn {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.65rem;
  color: #9ca3af;
  cursor: pointer;
  font-family: inherit;
  width: 14px;
  flex-shrink: 0;
  line-height: 1;
}

.collapse-btn:hover { color: var(--color-text); }

.collapse-spacer {
  width: 14px;
  flex-shrink: 0;
}

.type-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.08rem 0.4rem;
  border-radius: 20px;
  flex-shrink: 0;
}

.type-badge--system {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

.type-badge--sensor {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.type-badge--actuator {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.node-title {
  font-size: 0.875rem;
  color: var(--color-text);
  font-weight: 500;
}

.node-id {
  font-size: 0.75rem;
  color: #9ca3af;
  font-family: monospace;
}

.node-desc {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0 0 0.1rem 2.5rem;
  line-height: 1.4;
}
</style>

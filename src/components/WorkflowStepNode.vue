<script setup lang="ts">
import { ref } from 'vue'
import type { WorkflowStep } from '@/stores/workflow'
// Self-referencing recursive component — Vue resolves by filename in <script setup>
import WorkflowStepNode from './WorkflowStepNode.vue'

const props = defineProps<{
  step: WorkflowStep
  index: number
  total: number
  context: 'sequential' | 'parallel'
}>()

const expanded = ref(true)

const isParallel = props.step.type?.endsWith('ParallelActivity') ?? false
const isSequential = props.step.type?.endsWith('SequentialActivity') ?? false
const hasChildren = props.step.children.length > 0

function parseStepTitle(title: string | null): { number: string; name: string } {
  if (!title) return { number: '?', name: 'Unnamed Step' }
  const match = title.match(/^Step\s+(\d+):\s*(.+)$/)
  if (match) return { number: match[1], name: match[2] }
  return { number: '?', name: title }
}

const parsed = parseStepTitle(props.step.title)
</script>

<template>
  <div class="step-node" :class="{ 'step-node--parallel-child': context === 'parallel' }">
    <!-- Step item row -->
    <div class="step-item">
      <!-- Marker (circle + connector) — only for sequential context -->
      <div v-if="context === 'sequential'" class="step-marker">
        <div class="step-circle">{{ parsed.number }}</div>
        <div v-if="index < total - 1 || (hasChildren && expanded)" class="step-connector-line"></div>
      </div>

      <!-- Parallel bullet marker -->
      <div v-else class="step-parallel-marker">
        <div class="step-parallel-dot"></div>
      </div>

      <!-- Content -->
      <div class="step-content" :class="{ 'step-content--leaf': !hasChildren }">
        <div class="step-header">
          <!-- Collapse toggle for composite steps -->
          <button
            v-if="hasChildren"
            class="step-toggle"
            :aria-label="expanded ? 'Collapse' : 'Expand'"
            @click="expanded = !expanded"
          >
            {{ expanded ? '▼' : '▶' }}
          </button>
          <h3 class="step-name">{{ parsed.name }}</h3>
          <span v-if="isParallel" class="step-badge step-badge--parallel">⟷ parallel</span>
          <span v-else-if="isSequential" class="step-badge step-badge--sequential">↕ sequential</span>
        </div>
        <p v-if="step.description" class="step-description">{{ step.description }}</p>
      </div>
    </div>

    <!-- Children cluster (rendered below the item row) -->
    <div
      v-if="hasChildren && expanded"
      class="step-children"
      :class="isParallel ? 'step-children--parallel' : 'step-children--sequential'"
    >
      <WorkflowStepNode
        v-for="(child, i) in step.children"
        :key="child.uri"
        :step="child"
        :index="i"
        :total="step.children.length"
        :context="isParallel ? 'parallel' : 'sequential'"
      />
    </div>
  </div>
</template>

<style scoped>
.step-node {
  display: flex;
  flex-direction: column;
}

/* ── Sequential item row ── */
.step-item {
  display: flex;
  gap: 1.25rem;
}

.step-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 2rem;
}

.step-circle {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}

.step-connector-line {
  flex: 1;
  width: 2px;
  background: var(--color-border);
  margin: 0.3rem 0;
  min-height: 1.5rem;
}

/* ── Parallel bullet marker ── */
.step-parallel-marker {
  display: flex;
  align-items: flex-start;
  padding-top: 0.55rem;
  flex-shrink: 0;
  width: 1.25rem;
}

.step-parallel-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #3b82f6;
  flex-shrink: 0;
}

/* ── Step content ── */
.step-content {
  flex: 1;
  padding-bottom: 0.5rem;
}

/* Leaf nodes use more bottom padding (no children cluster below) */
.step-content--leaf {
  padding-bottom: 1.5rem;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
  flex-wrap: wrap;
}

.step-toggle {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.65rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}

.step-toggle:hover {
  color: var(--color-text);
}

.step-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.step-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 20px;
  letter-spacing: 0.02em;
}

.step-badge--parallel {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.step-badge--sequential {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.step-description {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.55;
  margin: 0;
}

/* ── Children clusters ── */
.step-children--sequential {
  margin-left: 3.25rem;
  padding: 0.5rem 0.75rem 0 1rem;
  border-left: 3px solid var(--color-border);
  border-radius: 0 4px 4px 0;
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
}

.step-children--parallel {
  margin-left: 3.25rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid #bfdbfe;
  border-radius: 0 6px 6px 0;
  background: #f8faff;
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 1.5rem;
}
</style>

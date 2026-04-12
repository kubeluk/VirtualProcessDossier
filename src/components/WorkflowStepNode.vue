<script setup lang="ts">
import { ref, computed } from 'vue'
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

const isAtomic = computed(
  () => !props.step.type || props.step.type === 'AtomicActivity',
)
const isParallel = computed(() => props.step.type === 'ParallelActivity')

const stepNumber = props.index + 1

const structureLabel = computed(() =>
  isParallel.value ? '⟷ Parallel' : '↕ Sequential',
)

const childCount = computed(() => props.step.children.length)
</script>

<template>
  <div class="step-node" :class="{ 'step-node--parallel-child': context === 'parallel' }">

    <!-- ── ATOMIC ACTIVITY ── -->
    <template v-if="isAtomic">
      <div class="step-item">
        <!-- Numbered circle — always shown for atomic activities regardless of parent context.
             Connector line only drawn in sequential flow (parallel cluster border suffices there). -->
        <div class="step-marker">
          <div class="step-circle">{{ stepNumber }}</div>
          <div v-if="context === 'sequential' && index < total - 1" class="step-connector-line"></div>
        </div>

        <div class="step-content step-content--leaf">
          <div class="step-header">
            <h3 class="step-name">{{ step.title ?? 'Unnamed Activity' }}</h3>
          </div>
          <p v-if="step.description" class="step-description">{{ step.description }}</p>
          <div v-if="step.systemTitle || step.inputTitle" class="step-meta">
            <span v-if="step.systemTitle" class="meta-item">
              <span class="meta-label">System:</span>
              <RouterLink
                :to="{ name: 'system', query: { uri: step.systemUri! } }"
                class="meta-link"
                @click.stop
              >{{ step.systemTitle }}</RouterLink>
            </span>
            <span v-if="step.inputTitle" class="meta-item">
              <span class="meta-label">Input:</span> {{ step.inputTitle }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- ── COMPOSITE ACTIVITY (structural container, no data title) ── -->
    <template v-else>
      <div class="step-item">
        <!-- Hollow numbered circle — always shown for composite nodes regardless of parent context.
             Connector line only in sequential flow. -->
        <div class="step-marker">
          <div class="step-circle step-circle--composite">{{ stepNumber }}</div>
          <div v-if="context === 'sequential' && (index < total - 1 || expanded)" class="step-connector-line"></div>
        </div>

        <div class="step-content">
          <div class="step-header">
            <button
              class="step-toggle"
              :aria-label="expanded ? 'Collapse' : 'Expand'"
              @click="expanded = !expanded"
            >
              {{ expanded ? '▼' : '▶' }}
            </button>
            <span
              class="step-badge"
              :class="isParallel ? 'step-badge--parallel' : 'step-badge--sequential'"
            >
              {{ structureLabel }}
            </span>
            <span v-if="!expanded" class="step-collapsed-hint">
              {{ childCount }} {{ childCount === 1 ? 'activity' : 'activities' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Children cluster -->
      <div
        v-if="expanded"
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
    </template>

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

/* Composite steps use a subtler circle */
.step-circle--composite {
  background: transparent;
  border: 2px solid var(--color-border);
  color: #9ca3af;
}

.step-connector-line {
  flex: 1;
  width: 2px;
  background: var(--color-border);
  margin: 0.3rem 0;
  min-height: 1.5rem;
}

/* ── Step content ── */
.step-content {
  flex: 1;
  padding-bottom: 0.5rem;
}

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

.step-collapsed-hint {
  font-size: 0.78rem;
  color: #9ca3af;
}

.step-description {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.55;
  margin: 0;
}

.step-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
  margin-top: 0.3rem;
}

.meta-item {
  font-size: 0.8rem;
  color: #6b7280;
}

.meta-label {
  font-weight: 600;
  color: #4b5563;
}

.meta-link {
  color: var(--color-primary);
  text-decoration: none;
}
.meta-link:hover { text-decoration: underline; }

/* ── Children clusters ── */
.step-children--sequential {
  margin-left: 3.25rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid #bbf7d0;
  border-radius: 0 6px 6px 0;
  background: #f0fdf4;
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

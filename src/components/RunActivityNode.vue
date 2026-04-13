<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWorkflowStore, type RunActivityInstance, type ParameterShape } from '@/stores/workflow'
// Self-referencing recursive component — Vue resolves by filename in <script setup>
import RunActivityNode from './RunActivityNode.vue'
import ActivityParameterForm from './ActivityParameterForm.vue'

const props = defineProps<{
  inst: RunActivityInstance
  index: number
  total: number
  context: 'sequential' | 'parallel'
}>()

const emit = defineEmits<{
  'open-dataset': [uri: string]
  'add-dataset': [modelActivityUri: string]
}>()

const workflowStore = useWorkflowStore()

const expanded = ref(true)

const isAtomic = computed(
  () => !props.inst.modelActivityType || props.inst.modelActivityType === 'AtomicActivity',
)

const parameterShape = ref<ParameterShape | null>(null)
const parameterValues = ref<Record<string, string>>({})
const parameterLoading = ref(false)

onMounted(async () => {
  if (!isAtomic.value) return
  parameterLoading.value = true
  try {
    const shape = await workflowStore.fetchParameterShape(props.inst.modelActivityUri)
    if (shape) {
      parameterShape.value = shape
      parameterValues.value = await workflowStore.fetchParameterValues(props.inst.uri, shape)
    }
  } finally {
    parameterLoading.value = false
  }
})
const isParallel = computed(() => props.inst.modelActivityType === 'ParallelActivity')

const stepNumber = props.index + 1

const structureLabel = computed(() =>
  isParallel.value ? '⟷ Parallel' : '↕ Sequential',
)

const childCount = computed(() => props.inst.children.length)

const stateLabel = computed(() => props.inst.state ?? null)
</script>

<template>
  <div class="act-node" :class="{ 'act-node--parallel-child': context === 'parallel' }">

    <!-- ── ATOMIC ACTIVITY INSTANCE ── -->
    <template v-if="isAtomic">
      <div class="act-item">
        <div class="act-marker">
          <div class="act-circle">{{ stepNumber }}</div>
          <div v-if="context === 'sequential' && index < total - 1" class="act-connector-line"></div>
        </div>

        <div class="act-content act-content--leaf">
          <div class="act-header">
            <h3 class="act-name">{{ inst.modelActivityTitle ?? 'Unnamed Activity' }}</h3>
            <span
              v-if="stateLabel"
              class="state-badge"
              :class="`state-badge--${inst.state}`"
            >
              {{ stateLabel }}
            </span>
          </div>

          <!-- Datasets -->
          <div v-if="inst.datasets.length > 0 || true" class="dataset-chips">
            <button
              v-for="ds in inst.datasets"
              :key="ds.uri"
              class="dataset-chip"
              :title="ds.description ?? undefined"
              @click="emit('open-dataset', ds.uri)"
            >
              {{ ds.title ?? ds.uri }}
            </button>
            <button
              class="dataset-chip dataset-chip--add"
              @click="emit('add-dataset', inst.modelActivityUri)"
            >
              + Add dataset
            </button>
          </div>

          <!-- Process parameter form -->
          <p v-if="parameterLoading" class="param-loading">Loading parameters…</p>
          <ActivityParameterForm
            v-else-if="parameterShape"
            :inst="inst"
            :shape="parameterShape"
            :initial-values="parameterValues"
            @saved="parameterValues = $event"
          />
        </div>
      </div>
    </template>

    <!-- ── COMPOSITE ACTIVITY INSTANCE (structural container) ── -->
    <template v-else>
      <div class="act-item">
        <div class="act-marker">
          <div class="act-circle act-circle--composite">{{ stepNumber }}</div>
          <div
            v-if="context === 'sequential' && (index < total - 1 || expanded)"
            class="act-connector-line"
          ></div>
        </div>

        <div class="act-content">
          <div class="act-header">
            <button
              class="act-toggle"
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
            <span
              v-if="stateLabel"
              class="state-badge"
              :class="`state-badge--${inst.state}`"
            >
              {{ stateLabel }}
            </span>
            <span v-if="!expanded" class="act-collapsed-hint">
              {{ childCount }} {{ childCount === 1 ? 'activity' : 'activities' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Children cluster -->
      <div
        v-if="expanded"
        class="act-children"
        :class="isParallel ? 'act-children--parallel' : 'act-children--sequential'"
      >
        <RunActivityNode
          v-for="(child, i) in inst.children"
          :key="child.uri"
          :inst="child"
          :index="i"
          :total="inst.children.length"
          :context="isParallel ? 'parallel' : 'sequential'"
          @open-dataset="emit('open-dataset', $event)"
          @add-dataset="emit('add-dataset', $event)"
        />
      </div>
    </template>

  </div>
</template>

<style scoped>
.act-node {
  display: flex;
  flex-direction: column;
}

/* ── Item row ── */
.act-item {
  display: flex;
  gap: 1.25rem;
}

.act-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 2rem;
}

.act-circle {
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

.act-circle--composite {
  background: transparent;
  border: 2px solid var(--color-border);
  color: #9ca3af;
}

.act-connector-line {
  flex: 1;
  width: 2px;
  background: var(--color-border);
  margin: 0.3rem 0;
  min-height: 1.5rem;
}

/* ── Content ── */
.act-content {
  flex: 1;
  padding-bottom: 0.5rem;
}

.act-content--leaf {
  padding-bottom: 1.75rem;
}

.act-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}

.act-toggle {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.65rem;
  color: #6b7280;
  cursor: pointer;
  line-height: 1;
  flex-shrink: 0;
}

.act-toggle:hover {
  color: var(--color-text);
}

.act-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

/* ── State badges ── */
.state-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 20px;
  letter-spacing: 0.02em;
}

.state-badge--initialized {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.state-badge--active {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.state-badge--done {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

/* ── Structure type badges ── */
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

.act-collapsed-hint {
  font-size: 0.78rem;
  color: #9ca3af;
}

/* ── Dataset chips ── */
.dataset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.dataset-chip {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 20px;
  padding: 0.3rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  font-family: inherit;
}

.dataset-chip:hover {
  background: #dcfce7;
  border-color: #86efac;
}

.dataset-chip--add {
  background: #fff;
  border-style: dashed;
  color: var(--color-primary);
}

.dataset-chip--add:hover {
  background: #f0fdf4;
  border-color: var(--color-primary);
}

/* ── Children clusters ── */
.act-children--sequential {
  margin-left: 3.25rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid #bbf7d0;
  border-radius: 0 6px 6px 0;
  background: #f0fdf4;
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
}

.act-children--parallel {
  margin-left: 3.25rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid #bfdbfe;
  border-radius: 0 6px 6px 0;
  background: #f8faff;
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
}

.param-loading {
  font-size: 0.78rem;
  color: #9ca3af;
  margin: 0.5rem 0 0;
}
</style>

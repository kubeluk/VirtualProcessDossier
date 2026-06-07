<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  useWorkflowStore,
  type ActivityPlanData,
  type SubPlanEntry,
} from '@/stores/workflow'

const props = defineProps<{ actInstUri: string }>()

const store = useWorkflowStore()
const plan = ref<ActivityPlanData | null>(null)
const loading = ref(false)
const expanded = ref(false)

const hasAnyData = computed(
  () =>
    !!plan.value &&
    (plan.value.directParams.length > 0 ||
      plan.value.subPlans.length > 0 ||
      plan.value.gripperPositions.length > 0 ||
      plan.value.closingSteps.length > 0),
)

// Gripper positions get their own dedicated table — skip sub-plans when present
const showGripperPositions = computed(() => (plan.value?.gripperPositions.length ?? 0) > 0)
const showSubPlans = computed(
  () => (plan.value?.subPlans.length ?? 0) > 0 && !showGripperPositions.value,
)
const showClosingSteps = computed(() => (plan.value?.closingSteps.length ?? 0) > 0)

const maxSpeed = computed(() =>
  Math.max(...(plan.value?.closingSteps.map((s) => s.speed) ?? [1])),
)

function subPlanLabel(sp: SubPlanEntry, index: number): string {
  if (sp.machineLabel) return sp.machineLabel
  if (sp.machineUri) {
    const local = sp.machineUri.split(/[/#]/).pop() ?? `Section ${index + 1}`
    return local.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }
  const tempGoal = sp.params.find((p) => p.paramUri.includes('temperatureGoal'))
  if (tempGoal?.sourceLabel) return tempGoal.sourceLabel
  return sp.params.find((p) => p.sourceLabel)?.sourceLabel ?? `Section ${index + 1}`
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v)
  const s = v.toFixed(2).replace(/\.?0+$/, '')
  return s
}

function gripperLabel(uri: string, label: string | null): string {
  if (label) return label
  const local = uri.split(/[/#]/).pop() ?? uri
  return local.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

onMounted(async () => {
  loading.value = true
  try {
    plan.value = await store.fetchActivityPlan(props.actInstUri)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div v-if="!loading && hasAnyData" class="plan-panel">

    <!-- ── Toggle ── -->
    <button class="plan-toggle" @click="expanded = !expanded">
      <span class="toggle-arrow">{{ expanded ? '▼' : '▶' }}</span>
      <span class="toggle-label">Machine Parameters</span>
      <span v-if="plan!.machineLabel" class="machine-chip">{{ plan!.machineLabel }}</span>
    </button>

    <!-- ── Expanded content ── -->
    <div v-if="expanded" class="plan-body">

      <!-- Direct scalar params (press force, cooling time, etc.) -->
      <div v-if="plan!.directParams.length > 0" class="plan-section">
        <table class="kv-table">
          <tbody>
            <tr
              v-for="(p, i) in plan!.directParams"
              :key="p.paramUri + (p.sourceUri ?? '') + i"
              class="kv-row"
            >
              <td class="kv-name">{{ p.paramName }}</td>
              <td class="kv-val">
                <span class="num">{{ fmt(p.value) }}</span>
                <span v-if="p.unit" class="unit">{{ p.unit }}</span>
              </td>
              <td v-if="p.sourceLabel" class="kv-source">{{ p.sourceLabel }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Gripper positions table -->
      <div v-if="showGripperPositions" class="plan-section">
        <p class="section-label">Gripper Positions</p>
        <table class="grid-table">
          <thead>
            <tr>
              <th class="th-name">Gripper</th>
              <th class="th-num">X (mm)</th>
              <th class="th-num">Y (mm)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pos in plan!.gripperPositions" :key="pos.machineUri" class="grid-row">
              <td class="td-name">{{ gripperLabel(pos.machineUri, pos.machineLabel) }}</td>
              <td class="td-num" :class="pos.x < 0 ? 'val-neg' : 'val-pos'">
                {{ pos.x > 0 ? '+' : '' }}{{ fmt(pos.x) }}
              </td>
              <td class="td-num" :class="pos.y < 0 ? 'val-neg' : 'val-pos'">
                {{ pos.y > 0 ? '+' : '' }}{{ fmt(pos.y) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Sub-plan sections (IR heating fields, etc.) -->
      <template v-if="showSubPlans">
        <div
          v-for="(sp, i) in plan!.subPlans"
          :key="sp.id"
          class="plan-section plan-subsection"
        >
          <p class="section-label">{{ subPlanLabel(sp, i) }}</p>
          <table class="kv-table">
            <tbody>
              <tr
                v-for="(p, pi) in sp.params"
                :key="p.paramUri + (p.sourceUri ?? '') + pi"
                class="kv-row"
              >
                <td class="kv-name">{{ p.paramName }}</td>
                <td class="kv-val">
                  <span class="num">{{ fmt(p.value) }}</span>
                  <span v-if="p.unit" class="unit">{{ p.unit }}</span>
                </td>
                <td v-if="p.sourceLabel" class="kv-source">{{ p.sourceLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Closing speed profile -->
      <div v-if="showClosingSteps" class="plan-section">
        <p class="section-label">Closing Speed Profile</p>
        <table class="grid-table">
          <thead>
            <tr>
              <th class="th-phase">Phase</th>
              <th class="th-num">Speed</th>
              <th class="th-bar"></th>
              <th class="th-num">Distance remaining</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(step, i) in plan!.closingSteps" :key="i" class="grid-row">
              <td class="td-phase">{{ i + 1 }}</td>
              <td class="td-num td-speed">
                <span class="num">{{ fmt(step.speed) }}</span>
                <span class="unit">{{ step.speedUnit }}</span>
              </td>
              <td class="td-bar-cell">
                <div class="speed-bar">
                  <div
                    class="speed-bar-fill"
                    :style="{ width: `${(step.speed / maxSpeed) * 100}%` }"
                  ></div>
                </div>
              </td>
              <td class="td-num">
                <span class="num">{{ fmt(step.remaining) }}</span>
                <span class="unit">{{ step.remainingUnit }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Panel wrapper ── */
.plan-panel {
  margin-top: 0.85rem;
}

/* ── Toggle button ── */
.plan-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
}

.plan-toggle:hover {
  background: #fef3c7;
  border-color: #fbbf24;
}

.toggle-arrow {
  font-size: 0.6rem;
  color: #d97706;
  flex-shrink: 0;
  line-height: 1;
}

.toggle-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #92400e;
  flex: 1;
  letter-spacing: 0.01em;
}

.machine-chip {
  font-size: 0.7rem;
  font-weight: 500;
  background: #fff;
  border: 1px solid #fde68a;
  color: #b45309;
  padding: 0.1rem 0.55rem;
  border-radius: 20px;
  flex-shrink: 0;
}

/* ── Body ── */
.plan-body {
  margin-top: 2px;
  background: #fffdf7;
  border: 1px solid #fde68a;
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

/* ── Sections ── */
.plan-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.plan-subsection {
  padding-top: 0.5rem;
  border-top: 1px solid #fde68a;
}

.plan-subsection:first-of-type {
  border-top: none;
  padding-top: 0;
}

.section-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #b45309;
  margin: 0;
}

/* ── Key-value table (direct params) ── */
.kv-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
}

.kv-row:not(:last-child) td {
  border-bottom: 1px solid #fef3c7;
}

.kv-name {
  padding: 0.3rem 0.5rem 0.3rem 0;
  color: #6b7280;
  width: 45%;
  vertical-align: middle;
}

.kv-val {
  padding: 0.3rem 0.5rem;
  font-weight: 600;
  color: var(--color-text);
  vertical-align: middle;
  white-space: nowrap;
}

.kv-source {
  padding: 0.3rem 0 0.3rem 0.5rem;
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: right;
  vertical-align: middle;
}

/* ── Grid table (positions, closing steps) ── */
.grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.grid-table thead tr {
  background: #fef3c7;
}

.th-name,
.th-num,
.th-phase,
.th-bar {
  padding: 0.3rem 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #92400e;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #fde68a;
}

.th-num,
.th-phase {
  text-align: right;
}

.th-bar {
  width: 80px;
}

.grid-row td {
  border-bottom: 1px solid #fef3c7;
  vertical-align: middle;
}

.grid-row:last-child td {
  border-bottom: none;
}

.td-name {
  padding: 0.35rem 0.5rem 0.35rem 0;
  color: #374151;
}

.td-num {
  padding: 0.35rem 0.5rem;
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
}

.td-phase {
  padding: 0.35rem 0.5rem;
  text-align: right;
  color: #9ca3af;
  font-size: 0.8rem;
}

.td-speed {
  min-width: 5.5rem;
}

.td-bar-cell {
  padding: 0.35rem 0.5rem;
  width: 80px;
}

/* ── Value formatting ── */
.num {
  color: var(--color-text);
}

.unit {
  font-size: 0.75rem;
  color: #6b7280;
  margin-left: 0.2rem;
}

.val-pos {
  color: #166534;
}

.val-neg {
  color: #991b1b;
}

/* ── Speed bar ── */
.speed-bar {
  height: 6px;
  background: #fef3c7;
  border-radius: 3px;
  overflow: hidden;
}

.speed-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  border-radius: 3px;
  transition: width 0.3s ease;
  min-width: 2px;
}
</style>

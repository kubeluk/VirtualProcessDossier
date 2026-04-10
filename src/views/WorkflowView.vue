<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  useWorkflowStore,
  type WorkflowDetail,
  type WorkflowInstanceSummary,
  type AddWorkflowForm,
} from '@/stores/workflow'
import AddWorkflowModal from '@/components/AddWorkflowModal.vue'
import WorkflowStepNode from '@/components/WorkflowStepNode.vue'

const route = useRoute()
const router = useRouter()
const workflowStore = useWorkflowStore()

const workflow = ref<WorkflowDetail | null>(null)
const instances = ref<WorkflowInstanceSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Edit workflow model
const showEditModal = ref(false)
const editData = ref<AddWorkflowForm | null>(null)
const loadingEdit = ref(false)
const loadEditError = ref<string | null>(null)

onMounted(async () => {
  const uri = route.query.uri as string
  if (!uri) {
    router.replace({ name: 'workflows' })
    return
  }
  try {
    ;[workflow.value, instances.value] = await Promise.all([
      workflowStore.fetchWorkflow(uri),
      workflowStore.fetchWorkflowInstances(uri),
    ])
    if (!workflow.value) error.value = 'Workflow not found.'
  } catch {
    error.value = 'Failed to load workflow.'
  } finally {
    loading.value = false
  }
})

async function openEditModal() {
  const uri = route.query.uri as string
  loadEditError.value = null
  loadingEdit.value = true
  try {
    editData.value = await workflowStore.fetchWorkflowForEdit(uri)
    showEditModal.value = true
  } catch {
    loadEditError.value = 'Failed to load workflow data for editing.'
  } finally {
    loadingEdit.value = false
  }
}

async function onWorkflowSaved() {
  const uri = route.query.uri as string
  workflow.value = await workflowStore.fetchWorkflow(uri)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

function openRun(uri: string) {
  router.push({ name: 'run', query: { uri } })
}
</script>

<template>
  <main class="workflow-view">
    <button class="back-link" @click="router.push({ name: 'workflows' })">← Back to workflows</button>

    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="workflow">
      <AddWorkflowModal
        v-model="showEditModal"
        :edit-uri="(route.query.uri as string)"
        :edit-data="editData"
        :metadata-only="instances.length > 0"
        @created="onWorkflowSaved"
      />

      <!-- Workflow model header -->
      <div class="wf-header">
        <div class="wf-header-row">
          <p class="wf-type-label">Workflow Model</p>
          <button
            class="btn btn--secondary"
            :disabled="loadingEdit"
            @click="openEditModal"
          >
            {{ loadingEdit ? 'Loading…' : 'Edit Workflow' }}
          </button>
        </div>
        <p v-if="loadEditError" class="load-edit-error">{{ loadEditError }}</p>
        <h1 class="wf-title">{{ workflow.title }}</h1>
        <p v-if="workflow.description" class="wf-description">{{ workflow.description }}</p>
        <p v-if="workflow.issued" class="wf-issued">Defined {{ formatDate(workflow.issued) }}</p>
      </div>

      <!-- Step structure (read-only overview) -->
      <section class="steps-section">
        <h2>Process Steps</h2>
        <p class="section-note">
          This is the static step structure defined in the workflow model. To see collected
          datasets, open a specific run below.
        </p>

        <div v-if="workflow.steps.length === 0" class="state-message">No steps defined.</div>

        <div v-else class="step-list">
          <WorkflowStepNode
            v-for="(step, idx) in workflow.steps"
            :key="step.uri"
            :step="step"
            :index="idx"
            :total="workflow.steps.length"
            context="sequential"
          />
        </div>
      </section>

      <!-- Workflow runs -->
      <section class="runs-section">
        <h2>Runs</h2>
        <p class="section-note">
          Each run is an execution of this workflow. Open a run to browse its datasets.
        </p>

        <div v-if="instances.length === 0" class="state-message">No runs recorded yet.</div>

        <ul v-else class="run-list">
          <li
            v-for="inst in instances"
            :key="inst.uri"
            class="run-card"
            @click="openRun(inst.uri)"
          >
            <div class="run-card-body">
              <div class="run-card-title-row">
                <span class="run-title">{{ inst.title ?? inst.uri }}</span>
                <span
                  class="run-state-badge"
                  :class="inst.state === 'active' ? 'run-state-badge--active' : 'run-state-badge--done'"
                >
                  {{ inst.state ?? '—' }}
                </span>
              </div>
              <p v-if="inst.description" class="run-description">{{ inst.description }}</p>
            </div>
            <div class="run-card-meta">
              <span v-if="inst.started" class="run-started">
                Started {{ formatDate(inst.started) }}
              </span>
              <span class="run-link">View run →</span>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.workflow-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.back-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.9rem;
  color: var(--color-primary);
  cursor: pointer;
  margin-bottom: 1.5rem;
  display: inline-block;
}

.back-link:hover {
  color: var(--color-primary-dark);
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error {
  color: #dc2626;
}

/* Workflow header */
.wf-header {
  margin-bottom: 2rem;
}

.wf-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.35rem;
}

.wf-type-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #6b7280;
  margin: 0;
}

.load-edit-error {
  font-size: 0.8rem;
  color: #dc2626;
  margin: 0 0 0.5rem;
}

.btn {
  padding: 0.4rem 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}

.btn--secondary {
  background: #fff;
  color: var(--color-text);
  border-color: var(--color-border);
}

.btn--secondary:hover:not(:disabled) {
  background: #f9fafb;
}

.btn--secondary:disabled {
  opacity: 0.6;
  cursor: default;
}

.wf-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.75rem;
}

.wf-description {
  font-size: 1rem;
  color: #4b5563;
  line-height: 1.6;
  margin: 0 0 0.5rem;
}

.wf-issued {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

/* Sections */
section {
  margin-bottom: 2.5rem;
}

section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.section-note {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 1rem;
}

/* Step list container */
.step-list {
  padding: 0;
  margin: 0;
}

/* Runs list */
.run-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.run-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--color-background);
}

.run-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(66, 184, 131, 0.15);
}

.run-card-body {
  margin-bottom: 0.6rem;
}

.run-card-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}

.run-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
}

.run-state-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.55rem;
  border-radius: 20px;
  text-transform: lowercase;
}

.run-state-badge--active {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.run-state-badge--done {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}

.run-description {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.run-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.run-started {
  font-size: 0.8rem;
  color: #6b7280;
}

.run-link {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--color-primary);
}
</style>

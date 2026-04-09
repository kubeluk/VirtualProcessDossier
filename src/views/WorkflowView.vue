<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowStore, type WorkflowDetail } from '@/stores/workflow'
import AddDatasetModal from '@/components/AddDatasetModal.vue'

const route = useRoute()
const router = useRouter()
const workflowStore = useWorkflowStore()

const workflow = ref<WorkflowDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const showAddModal = ref(false)
const addToStepUri = ref<string | undefined>(undefined)

const editingInstance = ref(false)
const instanceTitleInput = ref('')
const instanceDescInput = ref('')
const savingInstance = ref(false)
const saveInstanceError = ref<string | null>(null)

function startEditInstance() {
  instanceTitleInput.value = workflow.value?.instanceTitle ?? ''
  instanceDescInput.value = workflow.value?.instanceDescription ?? ''
  saveInstanceError.value = null
  editingInstance.value = true
}

function cancelEditInstance() {
  editingInstance.value = false
}

async function saveInstance() {
  if (!workflow.value?.instanceUri) return
  if (!instanceTitleInput.value.trim()) {
    saveInstanceError.value = 'Title is required.'
    return
  }
  savingInstance.value = true
  saveInstanceError.value = null
  try {
    await workflowStore.updateWorkflowInstance(
      workflow.value.instanceUri,
      instanceTitleInput.value.trim(),
      instanceDescInput.value.trim(),
    )
    workflow.value = await workflowStore.fetchWorkflow(route.query.uri as string)
    editingInstance.value = false
  } catch {
    saveInstanceError.value = 'Failed to save. Please try again.'
  } finally {
    savingInstance.value = false
  }
}

onMounted(async () => {
  const uri = route.query.uri as string
  if (!uri) {
    router.replace({ name: 'workflows' })
    return
  }
  try {
    workflow.value = await workflowStore.fetchWorkflow(uri)
    if (!workflow.value) error.value = 'Workflow not found.'
  } catch {
    error.value = 'Failed to load workflow.'
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

function parseStepTitle(title: string | null): { number: string; name: string } {
  if (!title) return { number: '?', name: 'Unnamed Step' }
  const match = title.match(/^Step (\d+):\s*(.+)$/)
  if (match) return { number: match[1], name: match[2] }
  return { number: '?', name: title }
}

function openDataset(uri: string) {
  router.push({ name: 'dataset', query: { uri } })
}

function openAddModal(stepUri: string) {
  addToStepUri.value = stepUri
  showAddModal.value = true
}

async function onDatasetCreated(uri: string) {
  // Reload the workflow so the new dataset chip appears
  const wfUri = route.query.uri as string
  workflow.value = await workflowStore.fetchWorkflow(wfUri)
  router.push({ name: 'dataset', query: { uri } })
}
</script>

<template>
  <main class="workflow-view">
    <button class="back-link" @click="router.push({ name: 'workflows' })">← Back to workflows</button>

    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="workflow">
      <!-- Workflow header -->
      <div class="wf-header">
        <h1 class="wf-title">{{ workflow.title }}</h1>
        <p v-if="workflow.description" class="wf-description">{{ workflow.description }}</p>
        <p v-if="workflow.issued" class="wf-issued">Created {{ formatDate(workflow.issued) }}</p>
      </div>

      <!-- Workflow instance section -->
      <div v-if="workflow.instanceUri" class="wf-instance">
        <div class="wf-instance-header">
          <span class="wf-instance-label">Workflow Run</span>
          <button v-if="!editingInstance" class="edit-btn" @click="startEditInstance">Edit</button>
        </div>

        <!-- View mode -->
        <template v-if="!editingInstance">
          <p class="wf-instance-title">{{ workflow.instanceTitle ?? '(no title)' }}</p>
          <p v-if="workflow.instanceDescription" class="wf-instance-desc">{{ workflow.instanceDescription }}</p>
        </template>

        <!-- Edit mode -->
        <template v-else>
          <div class="edit-form">
            <label class="edit-label" for="inst-title">Title</label>
            <input
              id="inst-title"
              v-model="instanceTitleInput"
              class="edit-input"
              type="text"
              placeholder="Workflow run title"
            />
            <label class="edit-label" for="inst-desc">Description</label>
            <textarea
              id="inst-desc"
              v-model="instanceDescInput"
              class="edit-textarea"
              rows="3"
              placeholder="Optional description"
            />
            <p v-if="saveInstanceError" class="edit-error">{{ saveInstanceError }}</p>
            <div class="edit-actions">
              <button class="btn-save" :disabled="savingInstance" @click="saveInstance">
                {{ savingInstance ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn-cancel" :disabled="savingInstance" @click="cancelEditInstance">Cancel</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Cross-cutting datasets (linked to the workflow as a whole) -->
      <section class="cross-cutting-section">
        <h2>Full-workflow Datasets</h2>
        <p class="section-note">
          These datasets cover the entire workflow from start to finish and are not tied to a single step.
        </p>
        <div class="dataset-chips">
          <button
            v-for="ds in workflow.crossCuttingDatasets"
            :key="ds.uri"
            class="dataset-chip"
            :title="ds.description ?? undefined"
            @click="openDataset(ds.uri)"
          >
            {{ ds.title ?? ds.uri }}
          </button>
          <button class="dataset-chip dataset-chip--add" @click="openAddModal(workflow.uri)">
            + Add dataset
          </button>
        </div>
      </section>

      <!-- Step timeline -->
      <section class="steps-section">
        <h2>Workflow Steps</h2>

        <div v-if="workflow.steps.length === 0" class="state-message">No steps found.</div>

        <ol v-else class="step-list">
          <li
            v-for="(step, idx) in workflow.steps"
            :key="step.uri"
            class="step-item"
          >
            <!-- Left: circle + connector line -->
            <div class="step-marker">
              <div class="step-circle">{{ parseStepTitle(step.title).number }}</div>
              <div v-if="idx < workflow.steps.length - 1" class="step-connector-line"></div>
            </div>

            <!-- Right: step content -->
            <div class="step-content">
              <div class="step-header">
                <h3 class="step-name">{{ parseStepTitle(step.title).name }}</h3>
                <span v-if="step.type === 'ParallelActivity'" class="step-badge step-badge--parallel">
                  ⟷ parallel
                </span>
              </div>

              <p v-if="step.description" class="step-description">{{ step.description }}</p>

              <div class="step-datasets">
                <span class="step-datasets-label">Datasets collected here</span>
                <div class="dataset-chips">
                  <button
                    v-for="ds in step.datasets"
                    :key="ds.uri"
                    class="dataset-chip"
                    :title="ds.description ?? undefined"
                    @click="openDataset(ds.uri)"
                  >
                    {{ ds.title ?? ds.uri }}
                  </button>
                  <button class="dataset-chip dataset-chip--add" @click="openAddModal(step.uri)">
                    + Add dataset
                  </button>
                </div>
              </div>
            </div>
          </li>
        </ol>
      </section>
    </template>
  </main>

  <AddDatasetModal
    v-model="showAddModal"
    :preselected-step-uri="addToStepUri"
    @created="onDatasetCreated"
  />
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
  margin-bottom: 1.25rem;
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

/* Workflow instance */
.wf-instance {
  background: #f9fafb;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 2rem;
}

.wf-instance-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.wf-instance-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #6b7280;
}

.wf-instance-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.25rem;
}

.wf-instance-desc {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0;
  line-height: 1.55;
}

.edit-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.2rem 0.65rem;
  font-size: 0.8rem;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
}

.edit-btn:hover {
  background: #f0fdf4;
  border-color: var(--color-primary);
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.edit-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
}

.edit-input,
.edit-textarea {
  font-family: inherit;
  font-size: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  color: var(--color-text);
  background: #fff;
  resize: vertical;
}

.edit-input:focus,
.edit-textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.edit-error {
  font-size: 0.8rem;
  color: #dc2626;
  margin: 0;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-save {
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
}

.btn-save:hover:not(:disabled) {
  background: var(--color-primary-dark);
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.875rem;
  font-family: inherit;
  cursor: pointer;
  color: #374151;
}

.btn-cancel:hover:not(:disabled) {
  background: #f3f4f6;
}

.btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Section shared styles */
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
  margin: 0 0 0.75rem;
}

/* Dataset chips */
.dataset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
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

/* Step timeline */
.step-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.step-item {
  display: flex;
  gap: 1.25rem;
}

/* Left column: circle + vertical line */
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

/* Right column: step content */
.step-content {
  flex: 1;
  padding-bottom: 2rem;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
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

.step-description {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.55;
  margin: 0 0 0.75rem;
}

.step-datasets-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.25rem;
}

.step-no-datasets {
  font-size: 0.8rem;
  color: #9ca3af;
  font-style: italic;
  margin: 0;
}
</style>

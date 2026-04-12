<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowStore, type RunDetail } from '@/stores/workflow'
import AddDatasetModal from '@/components/AddDatasetModal.vue'
import RunActivityNode from '@/components/RunActivityNode.vue'

const route = useRoute()
const router = useRouter()
const workflowStore = useWorkflowStore()

const run = ref<RunDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

// Inline edit
const editingRun = ref(false)
const runTitleInput = ref('')
const runDescInput = ref('')
const savingRun = ref(false)
const saveRunError = ref<string | null>(null)

// Add dataset modal
const showAddModal = ref(false)
const addToStepUri = ref<string | undefined>(undefined)

onMounted(async () => {
  const uri = route.query.uri as string
  if (!uri) {
    router.replace({ name: 'workflows' })
    return
  }
  try {
    run.value = await workflowStore.fetchRun(uri)
    if (!run.value) error.value = 'Run not found.'
  } catch {
    error.value = 'Failed to load run.'
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

function openDataset(uri: string) {
  router.push({ name: 'dataset', query: { uri } })
}

function openAddModal(modelActivityUri: string) {
  addToStepUri.value = modelActivityUri
  showAddModal.value = true
}

async function onDatasetCreated(uri: string) {
  const runUri = route.query.uri as string
  run.value = await workflowStore.fetchRun(runUri)
  router.push({ name: 'dataset', query: { uri } })
}

// Inline edit handlers
function startEditRun() {
  runTitleInput.value = run.value?.title ?? ''
  runDescInput.value = run.value?.description ?? ''
  saveRunError.value = null
  editingRun.value = true
}

function cancelEditRun() {
  editingRun.value = false
}

async function saveRun() {
  if (!run.value) return
  if (!runTitleInput.value.trim()) {
    saveRunError.value = 'Title is required.'
    return
  }
  savingRun.value = true
  saveRunError.value = null
  try {
    await workflowStore.updateWorkflowInstance(
      run.value.uri,
      runTitleInput.value.trim(),
      runDescInput.value.trim(),
    )
    run.value = await workflowStore.fetchRun(route.query.uri as string)
    editingRun.value = false
  } catch {
    saveRunError.value = 'Failed to save. Please try again.'
  } finally {
    savingRun.value = false
  }
}
</script>

<template>
  <main class="run-view">
    <button
      v-if="run"
      class="back-link"
      @click="router.push({ name: 'workflow', query: { uri: run.modelUri } })"
    >
      ← {{ run.modelTitle ?? 'Back to workflow' }}
    </button>
    <button v-else class="back-link" @click="router.push({ name: 'workflows' })">
      ← Back to workflows
    </button>

    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="run">
      <!-- Run header -->
      <div class="run-header">
        <p class="run-type-label">Workflow Run</p>

        <!-- View mode -->
        <template v-if="!editingRun">
          <div class="run-title-row">
            <h1 class="run-title">{{ run.title ?? '(untitled run)' }}</h1>
            <button class="edit-btn" @click="startEditRun">Edit</button>
          </div>
          <p v-if="run.description" class="run-description">{{ run.description }}</p>
          <div class="run-meta-row">
            <span v-if="run.started" class="run-meta-item">Started {{ formatDate(run.started) }}</span>
            <span
              v-if="run.state"
              class="run-state-badge"
              :class="run.state === 'active' ? 'run-state-badge--active' : 'run-state-badge--done'"
            >
              {{ run.state }}
            </span>
          </div>
        </template>

        <!-- Edit mode -->
        <template v-else>
          <div class="edit-form">
            <label class="edit-label" for="run-title">Title</label>
            <input
              id="run-title"
              v-model="runTitleInput"
              class="edit-input"
              type="text"
              placeholder="Run title"
            />
            <label class="edit-label" for="run-desc">Description</label>
            <textarea
              id="run-desc"
              v-model="runDescInput"
              class="edit-textarea"
              rows="3"
              placeholder="Optional description"
            />
            <p v-if="saveRunError" class="edit-error">{{ saveRunError }}</p>
            <div class="edit-actions">
              <button class="btn-save" :disabled="savingRun" @click="saveRun">
                {{ savingRun ? 'Saving…' : 'Save' }}
              </button>
              <button class="btn-cancel" :disabled="savingRun" @click="cancelEditRun">Cancel</button>
            </div>
          </div>
        </template>
      </div>

      <!-- Activity instances tree -->
      <section class="instances-section">
        <h2>Activity Instances</h2>

        <div v-if="run.activityInstances.length === 0" class="state-message">
          No activity instances found for this run.
        </div>

        <div v-else class="instances-list">
          <RunActivityNode
            v-for="(inst, i) in run.activityInstances"
            :key="inst.uri"
            :inst="inst"
            :index="i"
            :total="run.activityInstances.length"
            context="sequential"
            @open-dataset="openDataset"
            @add-dataset="openAddModal"
          />
        </div>
      </section>

      <!-- Cross-cutting datasets -->
      <section class="cross-cutting-section">
        <h2>Full-run Datasets</h2>
        <p class="section-note">
          These datasets cover the entire run and are not tied to a single activity.
        </p>
        <div class="dataset-chips">
          <button
            v-for="ds in run.crossCuttingDatasets"
            :key="ds.uri"
            class="dataset-chip"
            :title="ds.description ?? undefined"
            @click="openDataset(ds.uri)"
          >
            {{ ds.title ?? ds.uri }}
          </button>
          <button class="dataset-chip dataset-chip--add" @click="openAddModal(run.modelUri)">
            + Add dataset
          </button>
        </div>
      </section>
    </template>
  </main>

  <AddDatasetModal
    v-if="run"
    v-model="showAddModal"
    :preselected-step-uri="addToStepUri"
    :workflow-instance-uri="run.uri"
    @created="onDatasetCreated"
  />
</template>

<style scoped>
.run-view {
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

/* Run header */
.run-header {
  margin-bottom: 2rem;
}

.run-type-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #6b7280;
  margin: 0 0 0.35rem;
}

.run-title-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.run-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  flex: 1;
}

.run-description {
  font-size: 1rem;
  color: #4b5563;
  line-height: 1.6;
  margin: 0 0 0.5rem;
}

.run-meta-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.run-meta-item {
  font-size: 0.8rem;
  color: #6b7280;
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

/* Inline edit */
.edit-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.25rem 0.75rem;
  font-size: 0.8rem;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  margin-top: 0.4rem;
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

/* Sections */
section {
  margin-bottom: 2.5rem;
}

section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.section-note {
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0 0 0.75rem;
}

.instances-list {
  display: flex;
  flex-direction: column;
}

/* Dataset chips (cross-cutting section) */
.dataset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.4rem;
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
</style>

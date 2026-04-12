<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkflowStore, type AtomicActivitySummary } from '@/stores/workflow'
import AddActivityModal from '@/components/AddActivityModal.vue'

const workflowStore = useWorkflowStore()

const activities = ref<AtomicActivitySummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showModal = ref(false)
const selectedActivity = ref<AtomicActivitySummary | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    activities.value = await workflowStore.fetchAtomicActivities()
  } catch {
    error.value = 'Failed to load activities. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  selectedActivity.value = null
  showModal.value = true
}

function openEdit(activity: AtomicActivitySummary) {
  selectedActivity.value = activity
  showModal.value = true
}

function onCreated() {
  load()
}

function onUpdated() {
  load()
}

function onDeleted() {
  load()
}
</script>

<template>
  <main class="activity-list">
    <header class="page-header">
      <div class="page-header-row">
        <div>
          <h1>Activity Library</h1>
          <p class="subtitle">
            Reusable atomic activities that can be referenced in workflow models.
          </p>
        </div>
        <button class="btn btn--primary" @click="openCreate">+ Add Activity</button>
      </div>
    </header>

    <AddActivityModal
      v-model="showModal"
      :edit-activity="selectedActivity"
      @created="onCreated"
      @updated="onUpdated"
      @deleted="onDeleted"
    />

    <nav class="page-nav">
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <RouterLink to="/workflows" class="nav-tab">Workflows</RouterLink>
      <RouterLink to="/activities" class="nav-tab nav-tab--active">Activities</RouterLink>
    </nav>

    <div v-if="loading" class="state-message">Loading activities…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <div v-else-if="activities.length === 0" class="state-message">
      No activities in the library yet. Create one to reuse it across workflow models.
    </div>

    <ul v-else class="activity-card-list">
      <li
        v-for="act in activities"
        :key="act.uri"
        class="activity-card"
        @click="openEdit(act)"
      >
        <div class="card-body">
          <h2 class="card-title">{{ act.title ?? act.uri }}</h2>
          <p v-if="act.description" class="card-description">{{ act.description }}</p>
        </div>
        <div class="card-meta">
          <span v-if="act.systemTitle ?? act.systemUri" class="meta-item">
            System: {{ act.systemTitle ?? act.systemUri }}
          </span>
          <span v-if="act.inputTitle ?? act.inputUri" class="meta-item">
            Input: {{ act.inputTitle ?? act.inputUri }}
          </span>
          <span class="meta-item meta-link">Edit →</span>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.activity-list {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.page-header {
  margin-bottom: 1.25rem;
}

.page-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.subtitle {
  color: #6b7280;
  margin: 0;
}

.page-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 2rem;
}

.nav-tab {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.nav-tab:hover {
  color: var(--color-text);
}

.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error {
  color: #dc2626;
}

.activity-card-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.activity-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--color-background);
}

.activity-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(66, 184, 131, 0.15);
}

.card-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.card-description {
  font-size: 0.9rem;
  color: #4b5563;
  margin: 0 0 0.75rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.meta-item {
  font-size: 0.8rem;
  color: #6b7280;
}

.meta-link {
  color: var(--color-primary);
  font-weight: 500;
}

.btn {
  padding: 0.5rem 1.1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn--primary:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}
</style>

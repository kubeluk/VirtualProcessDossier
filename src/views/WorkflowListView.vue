<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkflowStore, type WorkflowSummary } from '@/stores/workflow'

const router = useRouter()
const workflowStore = useWorkflowStore()

const workflows = ref<WorkflowSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    workflows.value = await workflowStore.fetchWorkflows()
  } catch {
    error.value = 'Failed to load workflows. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function openWorkflow(uri: string) {
  router.push({ name: 'workflow', query: { uri } })
}
</script>

<template>
  <main class="workflow-list">
    <header class="page-header">
      <h1>Workflows</h1>
      <p class="subtitle">Browse manufacturing workflows and their associated datasets.</p>
    </header>

    <nav class="page-nav">
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <RouterLink to="/workflows" class="nav-tab nav-tab--active">Workflows</RouterLink>
    </nav>

    <div v-if="loading" class="state-message">Loading workflows…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <div v-else-if="workflows.length === 0" class="state-message">
      No workflows found in the knowledge graph.
    </div>

    <ul v-else class="workflow-card-list">
      <li
        v-for="wf in workflows"
        :key="wf.uri"
        class="workflow-card"
        @click="openWorkflow(wf.uri)"
      >
        <div class="card-body">
          <h2 class="card-title">{{ wf.title }}</h2>
          <p v-if="wf.description" class="card-description">{{ wf.description }}</p>
        </div>
        <div class="card-meta">
          <span v-if="wf.issued" class="meta-item">Created {{ formatDate(wf.issued) }}</span>
          <span class="meta-item meta-link">View workflow →</span>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.workflow-list {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.page-header {
  margin-bottom: 1.25rem;
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

.workflow-card-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.workflow-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--color-background);
}

.workflow-card:hover {
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
</style>

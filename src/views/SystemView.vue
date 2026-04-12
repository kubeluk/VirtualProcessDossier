<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkflowStore, type SystemSummary } from '@/stores/workflow'
import AddSystemModal from '@/components/AddSystemModal.vue'

const route = useRoute()
const workflowStore = useWorkflowStore()

const system = ref<SystemSummary | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const showModal = ref(false)

const uri = Array.isArray(route.query.uri) ? route.query.uri[0] ?? '' : route.query.uri ?? ''

async function load() {
  if (!uri) {
    error.value = 'No system URI provided.'
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    system.value = await workflowStore.fetchSystem(uri)
    if (!system.value) error.value = 'System not found.'
  } catch {
    error.value = 'Failed to load system. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <main class="system-view">
    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="system">
      <header class="page-header">
        <div class="page-header-row">
          <div>
            <div class="breadcrumb">
              <RouterLink to="/systems" class="breadcrumb-link">Systems</RouterLink>
              <span class="breadcrumb-sep">›</span>
              <span>{{ system.title ?? system.uri }}</span>
            </div>
            <h1>{{ system.title ?? system.uri }}</h1>
            <p v-if="system.identifier" class="system-identifier">ID: {{ system.identifier }}</p>
            <p v-if="system.description" class="subtitle">{{ system.description }}</p>
          </div>
          <button class="btn btn--secondary" @click="showModal = true">Edit</button>
        </div>
      </header>

      <AddSystemModal
        v-model="showModal"
        :edit-system="system"
        @updated="load"
        @deleted="$router.push('/systems')"
      />

      <section class="section">
        <h2 class="section-title">Implements</h2>
        <p v-if="system.implementedActivities.length === 0" class="state-message-inline">
          No activities linked yet.
        </p>
        <ul v-else class="activity-list">
          <li v-for="act in system.implementedActivities" :key="act.uri" class="activity-item">
            {{ act.title ?? act.uri }}
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.system-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.breadcrumb {
  font-size: 0.85rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.breadcrumb-link {
  color: var(--color-primary);
  text-decoration: none;
}
.breadcrumb-link:hover { text-decoration: underline; }

.breadcrumb-sep { color: #d1d5db; }

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.3rem;
}

.system-identifier {
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0 0 0.3rem;
  font-family: monospace;
}

.subtitle {
  color: #4b5563;
  margin: 0;
  line-height: 1.5;
}

.section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error { color: #dc2626; }

.state-message-inline {
  color: #6b7280;
  font-size: 0.9rem;
  margin: 0;
}

.activity-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.activity-item {
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--color-text);
  background: var(--color-background);
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

.btn--secondary {
  background: #fff;
  color: var(--color-text);
  border-color: var(--color-border);
}
.btn--secondary:hover { background: #f9fafb; }
</style>

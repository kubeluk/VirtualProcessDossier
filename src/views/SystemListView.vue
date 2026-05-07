<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useWorkflowStore, type SystemSummary, type SystemNodeType } from '@/stores/workflow'
import AddSystemModal from '@/components/AddSystemModal.vue'
import SystemSubTree from '@/components/SystemSubTree.vue'

const workflowStore = useWorkflowStore()

const systems = ref<SystemSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showModal = ref(false)
const selectedSystem = ref<SystemSummary | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    systems.value = await workflowStore.fetchSystems()
  } catch {
    error.value = 'Failed to load systems. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openCreate() {
  selectedSystem.value = null
  showModal.value = true
}

function openEdit(system: SystemSummary) {
  selectedSystem.value = system
  showModal.value = true
}

function typeLabel(t: SystemNodeType): string {
  if (t === 'sosa:Sensor') return 'Sensor'
  if (t === 'sosa:Actuator') return 'Actuator'
  return 'System'
}

const expanded = ref<Set<string>>(new Set())

function toggleExpand(uri: string) {
  if (expanded.value.has(uri)) {
    expanded.value.delete(uri)
  } else {
    expanded.value.add(uri)
  }
  expanded.value = new Set(expanded.value)
}
</script>

<template>
  <main class="system-list">
    <header class="page-header">
      <div class="page-header-row">
        <div>
          <h1>Systems</h1>
          <p class="subtitle">
            Machines and stations that implement workflow activities.
          </p>
        </div>
        <button class="btn btn--primary" @click="openCreate">+ Add System</button>
      </div>
    </header>

    <AddSystemModal
      v-model="showModal"
      :edit-system="selectedSystem"
      @created="load"
      @updated="load"
      @deleted="load"
    />

    <nav class="page-nav">
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <RouterLink to="/workflows" class="nav-tab">Workflows</RouterLink>
      <RouterLink to="/activities" class="nav-tab">Activities</RouterLink>
      <RouterLink to="/systems" class="nav-tab nav-tab--active">Systems</RouterLink>
    </nav>

    <div v-if="loading" class="state-message">Loading systems…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <div v-else-if="systems.length === 0" class="state-message">
      No systems yet. Add one to associate machines with workflow activities.
    </div>

    <ul v-else class="system-card-list">
      <li
        v-for="sys in systems"
        :key="sys.uri"
        class="system-card"
      >
        <!-- Card header (clickable to edit) -->
        <div class="card-body" @click="openEdit(sys)">
          <div class="card-title-row">
            <h2 class="card-title">{{ sys.title ?? sys.uri }}</h2>
            <span class="type-badge" :class="`type-badge--${sys.type.split(':')[1].toLowerCase()}`">
              {{ typeLabel(sys.type) }}
            </span>
          </div>
          <p v-if="sys.description" class="card-description">{{ sys.description }}</p>
        </div>

        <div class="card-meta" @click="openEdit(sys)">
          <span v-if="sys.identifier" class="meta-item">
            ID: {{ sys.identifier }}
          </span>
          <span v-if="sys.implementedActivities.length > 0" class="meta-item">
            Implements:
            {{ sys.implementedActivities.map((a) => a.title ?? a.uri).join(', ') }}
          </span>
          <span class="meta-item meta-link">Edit →</span>
        </div>

        <!-- Sub-system tree (progressive disclosure) -->
        <div v-if="sys.children.length > 0" class="subsystem-section">
          <button
            type="button"
            class="subsystem-toggle"
            @click="toggleExpand(sys.uri)"
          >
            <span class="toggle-arrow">{{ expanded.has(sys.uri) ? '▼' : '▶' }}</span>
            {{ sys.children.length }}
            {{ sys.children.length === 1 ? 'sub-system' : 'sub-systems' }}
          </button>
          <SystemSubTree
            v-if="expanded.has(sys.uri)"
            :nodes="sys.children"
            :depth="0"
          />
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.system-list {
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

.nav-tab:hover { color: var(--color-text); }

.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error { color: #dc2626; }

.system-card-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.system-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.system-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(66, 184, 131, 0.15);
}

.card-body {
  padding: 1.25rem 1.5rem 0.5rem;
  cursor: pointer;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.4rem;
  flex-wrap: wrap;
}

.card-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.type-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 20px;
  flex-shrink: 0;
}

.type-badge--system {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}

.type-badge--sensor {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.type-badge--actuator {
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
}

.card-description {
  font-size: 0.9rem;
  color: #4b5563;
  margin: 0;
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
  padding: 0.5rem 1.5rem 1rem;
  cursor: pointer;
}

.meta-item {
  font-size: 0.8rem;
  color: #6b7280;
}

.meta-link {
  color: var(--color-primary);
  font-weight: 500;
}

/* Sub-system tree disclosure */
.subsystem-section {
  border-top: 1px solid var(--color-border);
  padding: 0.6rem 1.5rem 0.75rem;
  background: #fafafa;
}

.subsystem-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.82rem;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
}

.subsystem-toggle:hover { color: var(--color-text); }

.toggle-arrow {
  font-size: 0.6rem;
  color: #9ca3af;
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

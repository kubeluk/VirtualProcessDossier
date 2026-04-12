<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogStore } from '@/stores/catalog'
import type { DatasetFilterOptions } from '@/stores/catalog'
import AddDatasetModal from '@/components/AddDatasetModal.vue'

const router = useRouter()
const catalog = useCatalogStore()
const showModal = ref(false)

// Filter state
const searchText = ref('')
const selectedKeywords = ref<string[]>([])
const selectedRunUri = ref('')
const selectedModelUri = ref('')

// Filter options loaded from the triple store
const filterOptions = ref<DatasetFilterOptions>({ keywords: [], workflowRuns: [], workflowModels: [] })
const filterOptionsLoading = ref(false)

const hasActiveFilters = computed(
  () =>
    searchText.value.trim() !== '' ||
    selectedKeywords.value.length > 0 ||
    selectedRunUri.value !== '' ||
    selectedModelUri.value !== '',
)

function activeFilterChips(): { label: string; clear: () => void }[] {
  const chips: { label: string; clear: () => void }[] = []
  if (searchText.value.trim()) {
    chips.push({ label: `"${searchText.value.trim()}"`, clear: () => (searchText.value = '') })
  }
  for (const kw of selectedKeywords.value) {
    chips.push({
      label: kw,
      clear: () => (selectedKeywords.value = selectedKeywords.value.filter((k) => k !== kw)),
    })
  }
  if (selectedRunUri.value) {
    const run = filterOptions.value.workflowRuns.find((r) => r.uri === selectedRunUri.value)
    chips.push({
      label: `Run: ${run?.title ?? selectedRunUri.value}`,
      clear: () => (selectedRunUri.value = ''),
    })
  }
  if (selectedModelUri.value) {
    const model = filterOptions.value.workflowModels.find((m) => m.uri === selectedModelUri.value)
    chips.push({
      label: `Workflow: ${model?.title ?? selectedModelUri.value}`,
      clear: () => (selectedModelUri.value = ''),
    })
  }
  return chips
}

function clearAllFilters() {
  searchText.value = ''
  selectedKeywords.value = []
  selectedRunUri.value = ''
  selectedModelUri.value = ''
}

function toggleKeyword(kw: string) {
  if (selectedKeywords.value.includes(kw)) {
    selectedKeywords.value = selectedKeywords.value.filter((k) => k !== kw)
  } else {
    selectedKeywords.value = [...selectedKeywords.value, kw]
  }
}

function refetchWithFilters() {
  catalog.fetchDatasets({
    search: searchText.value.trim() || undefined,
    keywords: selectedKeywords.value.length ? selectedKeywords.value : undefined,
    workflowRunUri: selectedRunUri.value || undefined,
    workflowModelUri: selectedModelUri.value || undefined,
  })
}

// Debounce search text; immediate for other filters
let searchTimer: ReturnType<typeof setTimeout>
watch(searchText, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => refetchWithFilters(), 400)
})
watch([selectedKeywords, selectedRunUri, selectedModelUri], () => refetchWithFilters())

onMounted(async () => {
  catalog.fetchDatasets()
  filterOptionsLoading.value = true
  try {
    filterOptions.value = await catalog.fetchFilterOptions()
  } finally {
    filterOptionsLoading.value = false
  }
})

onUnmounted(() => clearTimeout(searchTimer))

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function openDataset(uri: string) {
  router.push({ name: 'dataset', query: { uri } })
}

function onDatasetCreated(uri: string) {
  refetchWithFilters()
  router.push({ name: 'dataset', query: { uri } })
}
</script>

<template>
  <main class="catalog">
    <header class="catalog-header">
      <div class="catalog-header-top">
        <div>
          <h1>Data Catalog</h1>
          <p class="subtitle">Browse datasets available in the VPD knowledge graph.</p>
        </div>
        <button class="add-btn" @click="showModal = true">+ Add Dataset</button>
      </div>
    </header>

    <AddDatasetModal v-model="showModal" @created="onDatasetCreated" />

    <nav class="page-nav">
      <RouterLink to="/catalog" class="nav-tab nav-tab--active">Datasets</RouterLink>
      <RouterLink to="/workflows" class="nav-tab">Workflows</RouterLink>
      <RouterLink to="/activities" class="nav-tab">Activities</RouterLink>
      <RouterLink to="/systems" class="nav-tab">Systems</RouterLink>
    </nav>

    <!-- Filter panel -->
    <div class="filter-panel">
      <div class="filter-search-row">
        <div class="search-wrap">
          <span class="search-icon">⌕</span>
          <input
            v-model="searchText"
            class="search-input"
            type="search"
            placeholder="Search by title, description, or keyword…"
            aria-label="Search datasets"
          />
        </div>
      </div>

      <div v-if="!filterOptionsLoading" class="filter-facets">
        <!-- Keyword chips -->
        <div v-if="filterOptions.keywords.length" class="facet-group">
          <span class="facet-label">Keywords</span>
          <div class="keyword-chips">
            <button
              v-for="kw in filterOptions.keywords"
              :key="kw"
              class="kw-chip"
              :class="{ 'kw-chip--active': selectedKeywords.includes(kw) }"
              @click="toggleKeyword(kw)"
            >
              {{ kw }}
            </button>
          </div>
        </div>

        <!-- Workflow run select -->
        <div v-if="filterOptions.workflowRuns.length" class="facet-group facet-group--select">
          <label class="facet-label" for="run-select">Workflow Run</label>
          <select id="run-select" v-model="selectedRunUri" class="facet-select">
            <option value="">All runs</option>
            <option v-for="run in filterOptions.workflowRuns" :key="run.uri" :value="run.uri">
              {{ run.title ?? run.uri }}
            </option>
          </select>
        </div>

        <!-- Workflow model select -->
        <div v-if="filterOptions.workflowModels.length" class="facet-group facet-group--select">
          <label class="facet-label" for="model-select">Workflow Model</label>
          <select id="model-select" v-model="selectedModelUri" class="facet-select">
            <option value="">All workflows</option>
            <option v-for="model in filterOptions.workflowModels" :key="model.uri" :value="model.uri">
              {{ model.title ?? model.uri }}
            </option>
          </select>
        </div>
      </div>

      <!-- Active filter chips -->
      <div v-if="hasActiveFilters" class="active-filters">
        <button
          v-for="chip in activeFilterChips()"
          :key="chip.label"
          class="active-chip"
          @click="chip.clear()"
          :title="`Remove filter: ${chip.label}`"
        >
          {{ chip.label }} ×
        </button>
        <button class="clear-all-btn" @click="clearAllFilters">Clear all</button>
      </div>
    </div>

    <div v-if="catalog.loading" class="state-message">Loading datasets…</div>

    <div v-else-if="catalog.error" class="state-message error">{{ catalog.error }}</div>

    <div v-else>
      <p class="result-count">
        {{ catalog.datasets.length }}
        {{ catalog.datasets.length === 1 ? 'dataset' : 'datasets' }}
        <span v-if="hasActiveFilters"> matching your filters</span>
      </p>

      <div v-if="catalog.datasets.length === 0" class="state-message">
        No datasets match your filters.
      </div>

      <ul v-else class="dataset-list">
        <li
          v-for="ds in catalog.datasets"
          :key="ds.uri"
          class="dataset-card"
          @click="openDataset(ds.uri)"
        >
          <div class="card-body">
            <h2 class="card-title">{{ ds.title }}</h2>
            <p v-if="ds.description" class="card-description">{{ ds.description }}</p>
          </div>
          <div class="card-meta">
            <span v-if="ds.modified" class="meta-item">
              Updated {{ formatDate(ds.modified) }}
            </span>
            <span class="meta-item">
              {{ ds.distributionCount }}
              {{ ds.distributionCount === 1 ? 'distribution' : 'distributions' }}
            </span>
          </div>
        </li>
      </ul>
    </div>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.catalog-header {
  margin-bottom: 1.25rem;
}

.catalog-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.add-btn {
  flex-shrink: 0;
  padding: 0.5rem 1.1rem;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  margin-top: 0.25rem;
}

.add-btn:hover {
  background: var(--color-primary-dark);
}

.page-nav {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1.5rem;
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

.catalog-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.subtitle {
  color: #6b7280;
  margin: 0;
}

/* ── Filter panel ────────────────────────────────────────────────── */

.filter-panel {
  background: var(--color-background-soft, #f9fafb);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.filter-search-row {
  display: flex;
  gap: 0.75rem;
}

.search-wrap {
  position: relative;
  flex: 1;
}

.search-icon {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.1rem;
  color: #9ca3af;
  pointer-events: none;
  line-height: 1;
}

.search-input {
  width: 100%;
  padding: 0.45rem 0.75rem 0.45rem 2rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  background: var(--color-background);
  color: var(--color-text);
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.search-input::-webkit-search-cancel-button {
  cursor: pointer;
}

.filter-facets {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.facet-group {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.facet-group--select {
  align-items: center;
}

.facet-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  padding-top: 0.2rem;
  min-width: 5.5rem;
}

.keyword-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.kw-chip {
  padding: 0.25rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.8rem;
  font-family: inherit;
  background: var(--color-background);
  color: #4b5563;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.kw-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.kw-chip--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  font-weight: 600;
}

.kw-chip--active:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
  color: #fff;
}

.facet-select {
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 0.15s;
  max-width: 22rem;
}

.facet-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* ── Active filter chips ─────────────────────────────────────────── */

.active-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding-top: 0.25rem;
  border-top: 1px solid var(--color-border);
}

.active-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.6rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  font-size: 0.78rem;
  font-family: inherit;
  color: #1d4ed8;
  cursor: pointer;
  transition: background 0.12s;
}

.active-chip:hover {
  background: #dbeafe;
}

.clear-all-btn {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.78rem;
  font-family: inherit;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
  margin-left: 0.25rem;
}

.clear-all-btn:hover {
  color: #dc2626;
  border-color: #dc2626;
}

/* ── Result count ────────────────────────────────────────────────── */

.result-count {
  font-size: 0.83rem;
  color: #6b7280;
  margin: 0 0 0.75rem;
}

/* ── State messages ──────────────────────────────────────────────── */

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error {
  color: #dc2626;
}

/* ── Dataset list ────────────────────────────────────────────────── */

.dataset-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dataset-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--color-background);
}

.dataset-card:hover {
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
}

.meta-item {
  font-size: 0.8rem;
  color: #6b7280;
}
</style>

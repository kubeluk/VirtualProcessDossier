<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDossierStore, type DossierSummary } from '@/stores/dossier'

const router = useRouter()
const dossierStore = useDossierStore()

const dossiers = ref<DossierSummary[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    dossiers.value = await dossierStore.fetchAllPartSummaries()
  } catch {
    error.value = 'Failed to load production data. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
})

// ── Search ────────────────────────────────────────────────────────────────
const searchText = ref('')
const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout>

function onSearchInput(e: Event) {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = (e.target as HTMLInputElement).value
  }, 300)
}

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return dossiers.value
  return dossiers.value.filter(
    (d) =>
      partLabel(d.partUri).toLowerCase().includes(q) ||
      (d.runLabel ?? '').toLowerCase().includes(q),
  )
})

// ── Helpers ───────────────────────────────────────────────────────────────
function partLabel(uri: string): string {
  const m = uri.match(/[#/]([^#/]+)$/)
  return m ? `Part ${m[1]}` : uri
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<template>
  <main class="dossier-home">

    <!-- ── Page header ── -->
    <header class="page-header">
      <div>
        <h1>Virtual Process Dossier</h1>
        <p class="subtitle">Browse manufactured parts. Open a record to see the full provenance and material detail.</p>
      </div>
    </header>

    <!-- ── Nav ── -->
    <nav class="page-nav">
      <RouterLink to="/" class="nav-tab nav-tab--active">Dossier</RouterLink>
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <span class="nav-divider" aria-hidden="true"></span>
      <RouterLink to="/workflows" class="nav-tab nav-tab--secondary">Workflows</RouterLink>
      <RouterLink to="/systems" class="nav-tab nav-tab--secondary">Systems</RouterLink>
      <RouterLink to="/parts" class="nav-tab nav-tab--secondary">Parts</RouterLink>
    </nav>

    <!-- ── States ── -->
    <div v-if="loading" class="state-message">Loading production records…</div>
    <div v-else-if="error" class="state-message state-message--error">{{ error }}</div>
    <div v-else-if="dossiers.length === 0" class="state-message">
      No production records found. Register a workflow run to create the first record.
    </div>

    <template v-else>

      <!-- ── Search bar ── -->
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input
          class="search-input"
          type="search"
          placeholder="Search parts and runs…"
          :value="searchText"
          @input="(e) => { searchText = (e.target as HTMLInputElement).value; onSearchInput(e) }"
        />
      </div>

      <!-- ── Results count ── -->
      <p class="results-count">
        <template v-if="searchQuery.trim()">Showing {{ filtered.length }} of {{ dossiers.length }} records</template>
        <template v-else>{{ dossiers.length }} record{{ dossiers.length !== 1 ? 's' : '' }}</template>
      </p>

      <!-- ── Empty search state ── -->
      <div v-if="filtered.length === 0" class="state-message">
        No records match your search.
      </div>

      <!-- ── Product record cards ── -->
      <ul v-else class="record-cards">
        <li
          v-for="d in filtered"
          :key="d.partUri"
          class="record-card"
          @click="router.push({ name: 'dossier', query: { part: d.partUri } })"
        >
          <div class="card-inner">
            <div class="card-body">
              <div class="card-title-row">
                <span class="card-icon">◆</span>
                <h2 class="card-title">{{ partLabel(d.partUri) }}</h2>
              </div>

              <p class="card-meta">
                <span class="card-run">{{ d.runLabel ?? '(untitled run)' }}</span>
                <span v-if="d.runDate" class="card-sep">·</span>
                <span v-if="d.runDate" class="card-date">{{ formatDate(d.runDate) }}</span>
              </p>
            </div>

            <span class="card-arrow">→</span>
          </div>
        </li>
      </ul>

    </template>
  </main>
</template>

<style scoped>
.dossier-home {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

/* ── Page header ── */
.page-header {
  margin-bottom: 1.25rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.subtitle {
  color: #6b7280;
  margin: 0;
  font-size: 0.9rem;
}

/* ── Tab nav ── */
.page-nav {
  display: flex;
  align-items: center;
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

.nav-tab:hover { color: var(--color-text); }

.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.nav-divider {
  display: inline-block;
  width: 1px;
  height: 1.1rem;
  background: var(--color-border);
  align-self: center;
  margin: 0 0.2rem;
  flex-shrink: 0;
}

.nav-tab--secondary {
  font-size: 0.82rem;
  color: #9ca3af;
}
.nav-tab--secondary:hover { color: var(--color-text); }
.nav-tab--secondary.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

/* ── State messages ── */
.state-message {
  padding: 3rem;
  text-align: center;
  color: #6b7280;
}
.state-message--error { color: #dc2626; }

/* ── Search bar ── */
.search-wrap {
  position: relative;
  margin-bottom: 0.65rem;
}

.search-icon {
  position: absolute;
  left: 0.7rem;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
  font-size: 1rem;
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.52rem 0.75rem 0.52rem 2rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 0.88rem;
  font-family: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(59, 91, 219, 0.1);
}

/* ── Results count ── */
.results-count {
  font-size: 0.8rem;
  color: #9ca3af;
  margin: 0 0 0.75rem;
}

/* ── Record card list ── */
.record-cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

/* ── Record card ── */
.record-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-accent);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.1s;
}

.record-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.card-inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
}

/* ── Card body ── */
.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.card-icon {
  color: var(--color-accent);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin: 0;
}

.card-run {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text);
}

.card-sep  { color: #d1d5db; font-size: 0.85rem; }

.card-date {
  font-size: 0.82rem;
  color: #6b7280;
}

/* ── Arrow ── */
.card-arrow {
  font-size: 1rem;
  color: #d1d5db;
  flex-shrink: 0;
  transition: color 0.15s, transform 0.15s;
}

.record-card:hover .card-arrow {
  color: var(--color-accent);
  transform: translateX(2px);
}
</style>

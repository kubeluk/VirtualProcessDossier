<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMaterialStore, type PartDetail } from '@/stores/material'

const router = useRouter()
const route = useRoute()
const materialStore = useMaterialStore()

const parts = ref<PartDetail[]>([])
const details = ref<Record<string, PartDetail>>({})
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const allParts = await materialStore.fetchAllParts()
    parts.value = allParts
    for (const p of allParts) {
      details.value[p.uri] = p
    }
  } catch {
    error.value = 'Failed to load parts. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }

  const targetUri = route.query.part as string | undefined
  if (targetUri) {
    await nextTick()
    requestAnimationFrame(() => {
      document.getElementById(`part-${localName(targetUri)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
})

function localName(uri: string): string {
  const m = uri.match(/[#/]([^#/]+)$/)
  return m ? m[1] : uri
}

function partLabel(uri: string): string {
  return `Part ${localName(uri)}`
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}
</script>

<template>
  <main class="part-list">
    <header class="page-header">
      <h1>Parts</h1>
      <p class="subtitle">Manufactured parts with material composition and lineage.</p>
    </header>

    <nav class="page-nav">
      <RouterLink to="/" class="nav-tab">Dossier</RouterLink>
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <span class="nav-divider" aria-hidden="true"></span>
      <RouterLink to="/workflows" class="nav-tab nav-tab--secondary">Workflows</RouterLink>
      <RouterLink to="/systems" class="nav-tab nav-tab--secondary">Systems</RouterLink>
      <RouterLink to="/parts" class="nav-tab nav-tab--secondary nav-tab--active">Parts</RouterLink>
      <RouterLink to="/laminates" class="nav-tab nav-tab--secondary">Laminates</RouterLink>
    </nav>

    <div v-if="loading" class="state-message">Loading parts…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <div v-else-if="parts.length === 0" class="state-message">No parts found in the triple store.</div>

    <ul v-else class="part-cards">
      <li v-for="part in parts" :key="part.uri" :id="`part-${localName(part.uri)}`" class="part-card">

        <!-- ── Card header ─────────────────────────────────────────── -->
        <div class="part-header">
          <div class="part-title-row">
            <div class="part-title-block">
              <h2 class="part-title">{{ partLabel(part.uri) }}</h2>
              <p v-if="part.runDescription" class="part-subtitle">{{ part.runDescription }}</p>
            </div>
            <div class="part-actions">
              <button class="run-link" @click="router.push({ name: 'run', query: { uri: part.runUri } })">
                <span class="run-link-label">Produced in run</span>
                <span class="run-link-name">{{ part.runLabel ?? localName(part.runUri) }}</span>
                <span class="run-link-arrow">→</span>
              </button>
              <button
                class="dossier-link"
                @click="router.push({ name: 'dossier', query: { part: part.uri } })"
              >
                <span class="dossier-link-label">Dossier</span>
                <span class="dossier-link-arrow">→</span>
              </button>
            </div>
          </div>

          <!-- Lineage trail -->
          <div class="lineage-trail">
            <div class="lineage-node lineage-node--part">
              <span class="lineage-icon">◆</span>
              <span class="lineage-text">{{ partLabel(part.uri) }}</span>
            </div>
            <span class="lineage-arrow">←</span>
            <div class="lineage-node lineage-node--laminat">
              <span class="lineage-icon">▣</span>
              <span class="lineage-text">{{ part.laminatLabel ?? 'Laminate' }}</span>
              <span v-if="part.laminatId" class="lineage-sub">{{ part.laminatId }}</span>
            </div>
            <span class="lineage-arrow">←</span>
            <div class="lineage-node lineage-node--layup">
              <span class="lineage-icon">≋</span>
              <span class="lineage-text">{{ part.layupLabel ?? 'Layup' }}</span>
            </div>
            <template v-if="details[part.uri]">
              <span class="lineage-arrow">←</span>
              <div class="lineage-node lineage-node--tape">
                <span class="lineage-icon">▪</span>
                <span class="lineage-text">{{ details[part.uri]!.plies.length }}× Tape</span>
                <span v-if="details[part.uri]!.plies[0]?.fiberType && details[part.uri]!.plies[0]?.polymer" class="lineage-sub">
                  {{ details[part.uri]!.plies[0].fiberType }}/{{ details[part.uri]!.plies[0].polymer }}
                </span>
              </div>
            </template>
          </div>
        </div>

        <div class="laminate-summary">
          <span v-for="prop in part.properties" :key="prop.kind">{{ prop.kindLabel }}: {{ formatValue(prop.value) }} {{ prop.unitSymbol }}</span>
          <RouterLink :to="{ path: '/laminates', query: { laminate: part.laminatUri } }">View laminate →</RouterLink>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.part-list {
  max-width: 860px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

/* ── Header ────────────────────────────────────────────────────── */
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

/* ── Tab nav ────────────────────────────────────────────────────── */
.page-nav {
  display: flex;
  align-items: center;
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

.nav-divider {
  display: inline-block;
  width: 1px;
  height: 1.1rem;
  background: var(--color-border);
  align-self: center;
  margin: 0 0.2rem;
  flex-shrink: 0;
}

.nav-tab--secondary { font-size: 0.82rem; color: #9ca3af; }
.nav-tab--secondary:hover { color: var(--color-text); }
.nav-tab--secondary.nav-tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

/* ── State messages ─────────────────────────────────────────────── */
.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error { color: #dc2626; }

/* ── Card list ───────────────────────────────────────────────────── */
.part-cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.part-card {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-top: 4px solid #f59e0b;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

/* ── Card header ─────────────────────────────────────────────────── */
.part-header {
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(135deg, #fffbf0 0%, #ffffff 60%);
  border-bottom: 1px solid #fde68a;
}

.part-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.85rem;
}

.part-title-block {
  flex: 1;
  min-width: 0;
}

.part-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.2rem;
}

.part-subtitle {
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0;
  font-style: italic;
}

.run-link {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.1rem;
  background: none;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  cursor: pointer;
  font-family: inherit;
  text-align: right;
  flex-shrink: 0;
  transition: border-color 0.15s, background 0.15s;
}

.run-link:hover {
  border-color: var(--color-primary);
  background: #f0fdf4;
}

.run-link-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.run-link-name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-primary);
}

.run-link-arrow {
  font-size: 0.75rem;
  color: var(--color-primary);
}

.part-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-shrink: 0;
}

.dossier-link {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  background: none;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 0.35rem 0.85rem;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s, background 0.15s;
}

.dossier-link:hover {
  border-color: #f59e0b;
  background: #fffbf0;
}

.dossier-link-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
}

.dossier-link-arrow {
  font-size: 0.75rem;
  color: #b45309;
}

/* ── Lineage trail ───────────────────────────────────────────────── */
.lineage-trail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.lineage-node {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
}

.lineage-node--part {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.lineage-node--laminat {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.lineage-node--layup {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.lineage-node--tape {
  background: #f5f3ff;
  color: #5b21b6;
  border: 1px solid #ddd6fe;
}

.lineage-icon {
  font-size: 0.7rem;
  opacity: 0.8;
}

.lineage-text {
  font-weight: 600;
}

.lineage-sub {
  font-size: 0.7rem;
  font-weight: 400;
  opacity: 0.75;
}

.lineage-arrow {
  color: #9ca3af;
  font-size: 0.8rem;
  flex-shrink: 0;
}

.laminate-summary { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1rem 1.5rem; font-size: .875rem; }
.laminate-summary a { margin-left: auto; color: var(--color-primary); }
</style>

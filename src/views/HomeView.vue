<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMaterialStore } from '@/stores/material'
import { useDossierStore, type DossierData } from '@/stores/dossier'

const router = useRouter()
const materialStore = useMaterialStore()
const dossierStore = useDossierStore()

const dossiers = ref<DossierData[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const parts = await materialStore.fetchParts()
    const results = await Promise.all(parts.map((p) => dossierStore.fetchDossier(p.uri)))
    dossiers.value = results.filter((d): d is DossierData => d !== null)
  } catch {
    error.value = 'Failed to load production data. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
})

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

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.?0+$/, '')
}

function plyMaterial(d: DossierData): string | null {
  const ply = d.plies.find((p) => p.fiberType && p.polymer)
  return ply ? `${ply.fiberType}/${ply.polymer}` : null
}

function dimString(d: DossierData): string | null {
  const parts = [d.length, d.width, d.thickness].filter((v) => v !== null)
  if (!parts.length) return null
  return parts.map((v) => fmtNum(v!)).join(' × ') + ` ${d.dimUnit}`
}

const ORIENT_STYLES: Record<number, [string, string]> = {
  0: ['#d1fae5', '#065f46'],
  60: ['#dbeafe', '#1e40af'],
  120: ['#ede9fe', '#5b21b6'],
}
function orientBg(deg: number | null): string {
  return deg !== null ? (ORIENT_STYLES[deg]?.[0] ?? '#f3f4f6') : '#f3f4f6'
}
function orientFg(deg: number | null): string {
  return deg !== null ? (ORIENT_STYLES[deg]?.[1] ?? '#374151') : '#6b7280'
}
</script>

<template>
  <main class="dossier-home">

    <!-- ── Page header ── -->
    <header class="page-header">
      <div>
        <h1>Virtual Process Dossier</h1>
        <p class="subtitle">Scroll through the production records. Open a record to see the full process and material detail.</p>
      </div>
    </header>

    <!-- ── Nav ── -->
    <nav class="page-nav">
      <RouterLink to="/" class="nav-tab nav-tab--active">Dossier</RouterLink>
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <RouterLink to="/workflows" class="nav-tab">Workflows</RouterLink>
      <RouterLink to="/activities" class="nav-tab">Activities</RouterLink>
      <RouterLink to="/systems" class="nav-tab">Systems</RouterLink>
      <RouterLink to="/parts" class="nav-tab">Parts</RouterLink>
    </nav>

    <!-- ── States ── -->
    <div v-if="loading" class="state-message">Loading production records…</div>
    <div v-else-if="error" class="state-message state-message--error">{{ error }}</div>
    <div v-else-if="dossiers.length === 0" class="state-message">
      No production records found. Register a workflow run to create the first record.
    </div>

    <!-- ── Product record cards ── -->
    <ul v-else class="record-cards">
      <li
        v-for="d in dossiers"
        :key="d.partUri"
        class="record-card"
        @click="router.push({ name: 'dossier', query: { part: d.partUri } })"
      >
        <div class="card-inner">

          <!-- Left: identifying info -->
          <div class="card-body">
            <div class="card-title-row">
              <span class="card-icon">◆</span>
              <h2 class="card-title">{{ partLabel(d.partUri) }}</h2>
              <span
                v-if="d.runState"
                class="state-badge"
                :class="d.runState === 'done' ? 'state-badge--done' : 'state-badge--active'"
              >
                {{ d.runState }}
              </span>
            </div>

            <p class="card-meta">
              <span class="card-run">{{ d.runLabel ?? '(untitled run)' }}</span>
              <span v-if="d.runDate" class="card-sep">·</span>
              <span v-if="d.runDate" class="card-date">{{ formatDate(d.runDate) }}</span>
            </p>

            <p v-if="d.workflowLabel" class="card-workflow">{{ d.workflowLabel }}</p>

            <!-- Material brief -->
            <div class="mat-brief">
              <span v-if="plyMaterial(d)" class="mat-chip mat-chip--material">{{ plyMaterial(d) }}</span>
              <span v-if="d.plies.length" class="mat-chip">{{ d.plies.length }} plies</span>
              <span
                v-for="(ply, i) in d.plies"
                :key="i"
                class="ply-badge"
                :style="{ background: orientBg(ply.orientation), color: orientFg(ply.orientation) }"
              >
                {{ ply.orientation !== null ? `${ply.orientation}°` : '?°' }}
              </span>
              <span v-if="dimString(d)" class="mat-chip mat-chip--dims">{{ dimString(d) }}</span>
            </div>
          </div>

          <!-- Right: open button -->
          <div class="card-action">
            <span class="open-label">Open record</span>
            <span class="open-arrow">→</span>
          </div>

        </div>
      </li>
    </ul>
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

/* ── State messages ── */
.state-message {
  padding: 3rem;
  text-align: center;
  color: #6b7280;
}
.state-message--error { color: #dc2626; }

/* ── Record card list ── */
.record-cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

/* ── Record card ── */
.record-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-top: 4px solid #f59e0b;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
}

.record-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #fbbf24;
  transform: translateY(-1px);
}

.card-inner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.4rem;
}

/* ── Card body ── */
.card-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.card-icon {
  color: #f59e0b;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.state-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 20px;
  letter-spacing: 0.04em;
}
.state-badge--done  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.state-badge--active { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

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

.card-sep { color: #d1d5db; font-size: 0.85rem; }

.card-date {
  font-size: 0.82rem;
  color: #6b7280;
}

.card-workflow {
  font-size: 0.78rem;
  color: #9ca3af;
  margin: 0;
}

/* ── Material brief ── */
.mat-brief {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.2rem;
}

.mat-chip {
  font-size: 0.75rem;
  color: #4b5563;
  padding: 0.15rem 0.5rem;
  background: #f3f4f6;
  border-radius: 20px;
  white-space: nowrap;
}

.mat-chip--material {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
}

.mat-chip--dims {
  font-variant-numeric: tabular-nums;
}

.ply-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.12rem 0.4rem;
  border-radius: 20px;
}

/* ── Card action ── */
.card-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-left: 1px solid #fef3c7;
}

.open-label {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #d97706;
  white-space: nowrap;
}

.open-arrow {
  font-size: 1.1rem;
  color: #f59e0b;
  line-height: 1;
}
</style>

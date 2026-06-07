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

function chipParams(act: DossierData['activities'][number]): string {
  return act.keyParams
    .slice(0, 2)
    .map((p) => p.value)
    .join(' · ')
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
        <p class="subtitle">All manufactured parts — process parameters, material composition, and linked datasets.</p>
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
    <div v-if="loading" class="state-message">Loading production data…</div>
    <div v-else-if="error" class="state-message state-message--error">{{ error }}</div>
    <div v-else-if="dossiers.length === 0" class="state-message">
      No produced parts found. Start by registering a workflow run.
    </div>

    <!-- ── Dossier cards ── -->
    <ul v-else class="dossier-cards">
      <li v-for="d in dossiers" :key="d.partUri" class="dossier-card">

        <!-- Header -->
        <div class="card-header">
          <div class="card-top-row">
            <div>
              <p class="card-eyebrow">Virtual Process Dossier</p>
              <h2 class="card-title">{{ partLabel(d.partUri) }}</h2>
            </div>
            <button
              class="card-permalink"
              @click="router.push({ name: 'dossier', query: { part: d.partUri } })"
            >
              Open →
            </button>
          </div>
          <div class="card-meta-row">
            <span class="card-run">{{ d.runLabel ?? '(untitled run)' }}</span>
            <span v-if="d.runDate" class="card-sep">·</span>
            <span v-if="d.runDate" class="card-date">{{ formatDate(d.runDate) }}</span>
            <span
              v-if="d.runState"
              class="card-state"
              :class="d.runState === 'done' ? 'card-state--done' : 'card-state--active'"
            >
              {{ d.runState }}
            </span>
          </div>
          <p v-if="d.workflowLabel" class="card-workflow">{{ d.workflowLabel }}</p>
        </div>

        <!-- Process strip -->
        <div class="card-body-section">
          <p class="body-label">Process</p>
          <div class="process-strip">
            <template v-for="(act, i) in d.activities" :key="act.actInstUri">
              <div
                class="proc-chip"
                :class="act.hasPlan ? 'proc-chip--planned' : 'proc-chip--plain'"
              >
                <span class="chip-name">{{ act.title ?? 'Activity' }}</span>
                <span v-if="chipParams(act)" class="chip-params">{{ chipParams(act) }}</span>
              </div>
              <span v-if="i < d.activities.length - 1" class="proc-arrow">→</span>
            </template>
          </div>
        </div>

        <!-- Material strip -->
        <div class="card-body-section card-body-section--material">
          <p class="body-label">Material</p>
          <div class="mat-strip">
            <span v-if="plyMaterial(d)" class="mat-token mat-token--material">{{ plyMaterial(d) }}</span>
            <span v-if="d.plies.length > 0" class="mat-token">{{ d.plies.length }} plies</span>
            <div v-if="d.plies.length > 0" class="ply-badges-row">
              <span
                v-for="(ply, i) in d.plies"
                :key="i"
                class="ply-badge"
                :style="{ background: orientBg(ply.orientation), color: orientFg(ply.orientation) }"
              >
                {{ ply.orientation !== null ? `${ply.orientation}°` : '?°' }}
              </span>
            </div>
            <span v-if="dimString(d)" class="mat-token mat-token--dims">{{ dimString(d) }}</span>
            <span v-if="d.fiberMassFraction !== null" class="mat-token">
              {{ fmtNum(d.fiberMassFraction) }}% fiber
            </span>
          </div>
        </div>

        <!-- Footer links -->
        <div class="card-footer">
          <button class="footer-btn" @click="router.push({ name: 'parts' })">
            ← Parts detail
          </button>
          <span class="footer-sep"></span>
          <button
            class="footer-btn"
            @click="router.push({ name: 'run', query: { uri: d.runUri } })"
          >
            Run detail →
          </button>
          <span class="footer-sep"></span>
          <button class="footer-btn footer-btn--datasets" @click="router.push({ name: 'catalog' })">
            {{ d.datasetCount }} {{ d.datasetCount === 1 ? 'dataset' : 'datasets' }}
          </button>
        </div>

      </li>
    </ul>
  </main>
</template>

<style scoped>
.dossier-home {
  max-width: 900px;
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
  font-size: 0.95rem;
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

/* ── Card list ── */
.dossier-cards {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* ── Card ── */
.dossier-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-top: 4px solid #f59e0b;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

/* ── Card header ── */
.card-header {
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(135deg, #fffbf0 0%, #ffffff 60%);
  border-bottom: 1px solid #fef3c7;
}

.card-top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.card-eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #d97706;
  margin: 0 0 0.2rem;
}

.card-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  line-height: 1.2;
}

.card-permalink {
  background: none;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #b45309;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  margin-top: 0.25rem;
  transition: background 0.15s, border-color 0.15s;
}

.card-permalink:hover {
  background: #fef3c7;
  border-color: #f59e0b;
}

.card-meta-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.2rem;
}

.card-run {
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--color-text);
}

.card-sep { color: #d1d5db; }

.card-date {
  font-size: 0.82rem;
  color: #6b7280;
}

.card-state {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.12rem 0.5rem;
  border-radius: 20px;
  letter-spacing: 0.04em;
}
.card-state--done  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
.card-state--active { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }

.card-workflow {
  font-size: 0.78rem;
  color: #9ca3af;
  margin: 0;
}

/* ── Card body sections ── */
.card-body-section {
  padding: 0.9rem 1.5rem;
  border-bottom: 1px solid #f3f4f6;
}

.card-body-section--material {
  background: #fafafa;
}

.body-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #9ca3af;
  margin: 0 0 0.6rem;
}

/* ── Process strip ── */
.process-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem;
  overflow-x: auto;
}

.proc-chip {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.45rem 0.7rem;
  border-radius: 7px;
  border-left: 3px solid transparent;
  min-width: 90px;
}

.proc-chip--planned {
  background: #fffdf7;
  border: 1px solid #fde68a;
  border-left-color: #f59e0b;
}

.proc-chip--plain {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-left-color: #e5e7eb;
}

.chip-name {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
}

.chip-params {
  font-size: 0.7rem;
  color: #b45309;
  font-weight: 500;
  white-space: nowrap;
}

.proc-arrow {
  color: #d1d5db;
  font-size: 0.9rem;
  flex-shrink: 0;
  padding: 0 0.1rem;
}

/* ── Material strip ── */
.mat-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.mat-token {
  font-size: 0.82rem;
  color: #4b5563;
  padding: 0.2rem 0.55rem;
  background: #f3f4f6;
  border-radius: 20px;
  white-space: nowrap;
}

.mat-token--material {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
}

.mat-token--dims {
  font-variant-numeric: tabular-nums;
}

.ply-badges-row {
  display: flex;
  gap: 0.2rem;
}

.ply-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 20px;
}

/* ── Card footer ── */
.card-footer {
  display: flex;
  align-items: center;
}

.footer-btn {
  flex: 1;
  background: none;
  border: none;
  padding: 0.75rem 1rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: background 0.15s;
}

.footer-btn:hover { background: #f0fdf4; }

.footer-btn--datasets {
  color: #6b7280;
}

.footer-btn--datasets:hover {
  background: #f9fafb;
  color: var(--color-text);
}

.footer-sep {
  width: 1px;
  height: 2rem;
  background: var(--color-border);
  flex-shrink: 0;
}
</style>

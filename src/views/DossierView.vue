<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDossierStore, type DossierData, type DossierActivity } from '@/stores/dossier'

const route = useRoute()
const router = useRouter()
const dossierStore = useDossierStore()

const dossier = ref<DossierData | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  const partUri = route.query.part as string | undefined
  if (!partUri) {
    router.replace({ name: 'parts' })
    return
  }
  try {
    dossier.value = await dossierStore.fetchDossier(partUri)
    if (!dossier.value) error.value = 'No dossier data found for this part.'
  } catch {
    error.value = 'Failed to load dossier. Make sure the triple store is running.'
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function partLabel(uri: string): string {
  const m = uri.match(/[#/]([^#/]+)$/)
  return m ? `Part ${m[1]}` : uri
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.?0+$/, '')
}

// Ply orientation styling (same palette as PartListView)
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

const plyMaterial = computed(() => {
  if (!dossier.value) return null
  const ply = dossier.value.plies.find((p) => p.fiberType && p.polymer)
  if (!ply) return null
  return `${ply.fiberType}/${ply.polymer}`
})

const dimString = computed(() => {
  const d = dossier.value
  if (!d) return null
  const parts: string[] = []
  if (d.length !== null) parts.push(`${fmtNum(d.length)}`)
  if (d.width !== null) parts.push(`${fmtNum(d.width)}`)
  if (d.thickness !== null) parts.push(`${fmtNum(d.thickness)}`)
  if (!parts.length) return null
  return parts.join(' × ') + ` ${d.dimUnit}`
})

// Activities that are atomic and have useful content
const atomicActivities = computed<DossierActivity[]>(
  () => dossier.value?.activities ?? [],
)
</script>

<template>
  <main class="dossier-view">

    <!-- Back navigation -->
    <button class="back-link" @click="router.push({ name: 'home' })">← Dossier overview</button>

    <div v-if="loading" class="state-msg">Loading dossier…</div>
    <div v-else-if="error" class="state-msg state-msg--error">{{ error }}</div>

    <template v-else-if="dossier">

      <!-- ── HEADER ───────────────────────────────────────────────── -->
      <div class="dossier-header">
        <p class="header-eyebrow">Virtual Process Dossier</p>
        <h1 class="header-title">{{ partLabel(dossier.partUri) }}</h1>
        <div class="header-meta">
          <span class="header-run">{{ dossier.runLabel ?? 'Unnamed Run' }}</span>
          <span v-if="dossier.runDate" class="header-sep">·</span>
          <span v-if="dossier.runDate" class="header-date">{{ formatDate(dossier.runDate) }}</span>
          <span
            v-if="dossier.runState"
            class="header-state"
            :class="dossier.runState === 'done' ? 'header-state--done' : 'header-state--active'"
          >
            {{ dossier.runState }}
          </span>
        </div>
        <p v-if="dossier.workflowLabel" class="header-workflow">
          {{ dossier.workflowLabel }}
        </p>
      </div>

      <!-- ── MANUFACTURING PROCESS ─────────────────────────────────── -->
      <section class="dossier-section">
        <h2 class="section-title">Manufacturing Process</h2>

        <div class="timeline">
          <template v-for="(act, i) in atomicActivities" :key="act.actInstUri">
            <div class="act-card" :class="act.hasPlan ? 'act-card--planned' : 'act-card--plain'">
              <p class="act-name">{{ act.title ?? 'Unnamed Activity' }}</p>
              <p v-if="act.machineLabel" class="act-machine">{{ act.machineLabel }}</p>
              <ul v-if="act.keyParams.length > 0" class="act-params">
                <li v-for="p in act.keyParams" :key="p.label" class="act-param">
                  <span class="param-label">{{ p.label }}</span>
                  <span class="param-value">{{ p.value }}</span>
                </li>
              </ul>
              <p v-else class="act-no-params">No recorded parameters</p>
            </div>
            <div v-if="i < atomicActivities.length - 1" class="timeline-arrow">→</div>
          </template>
        </div>
      </section>

      <!-- ── MATERIAL ──────────────────────────────────────────────── -->
      <section class="dossier-section">
        <h2 class="section-title">Material</h2>

        <!-- Lineage trail -->
        <div class="lineage">
          <div class="lineage-node lineage-node--part">
            <span class="ln-icon">◆</span>
            <span class="ln-text">{{ partLabel(dossier.partUri) }}</span>
          </div>
          <span class="ln-arrow">←</span>
          <div class="lineage-node lineage-node--laminat">
            <span class="ln-icon">▣</span>
            <span class="ln-text">{{ dossier.laminatLabel ?? 'Laminat' }}</span>
            <span v-if="dossier.laminatId" class="ln-sub">{{ dossier.laminatId }}</span>
          </div>
          <span class="ln-arrow">←</span>
          <div class="lineage-node lineage-node--layup">
            <span class="ln-icon">≋</span>
            <span class="ln-text">{{ dossier.layupLabel ?? 'Layup' }}</span>
          </div>
          <span class="ln-arrow">←</span>
          <div class="lineage-node lineage-node--tape">
            <span class="ln-icon">▪</span>
            <span class="ln-text">{{ dossier.plies.length }}× Tape</span>
            <span v-if="plyMaterial" class="ln-sub">{{ plyMaterial }}</span>
          </div>
        </div>

        <!-- Key facts row -->
        <div class="mat-facts">
          <div v-if="dimString" class="mat-fact">
            <span class="mat-fact-label">Dimensions</span>
            <span class="mat-fact-value">{{ dimString }}</span>
          </div>
          <div v-if="dossier.fiberMassFraction !== null" class="mat-fact">
            <span class="mat-fact-label">Fiber mass fraction</span>
            <span class="mat-fact-value">{{ fmtNum(dossier.fiberMassFraction) }}%</span>
          </div>
          <div v-if="dossier.plies.length > 0" class="mat-fact">
            <span class="mat-fact-label">Ply count</span>
            <span class="mat-fact-value">{{ dossier.plies.length }}</span>
          </div>
        </div>

        <!-- Ply stack orientation badges -->
        <div v-if="dossier.plies.length > 0" class="ply-stack">
          <span class="ply-stack-label">Ply stack</span>
          <div class="ply-badges">
            <span
              v-for="(ply, i) in dossier.plies"
              :key="i"
              class="ply-badge"
              :style="{ background: orientBg(ply.orientation), color: orientFg(ply.orientation) }"
            >
              {{ ply.orientation !== null ? `${ply.orientation}°` : '?°' }}
            </span>
          </div>
        </div>
      </section>

      <!-- ── NAVIGATION FOOTER ─────────────────────────────────────── -->
      <div class="dossier-footer">
        <button class="footer-link" @click="router.push({ name: 'parts' })">
          ← What it's made of
        </button>
        <span class="footer-divider"></span>
        <button class="footer-link" @click="router.push({ name: 'run', query: { uri: dossier.runUri } })">
          How it was made →
        </button>
        <span class="footer-divider"></span>
        <button
          class="footer-link footer-link--datasets"
          @click="router.push({ name: 'catalog', query: { run: dossier.runUri } })"
        >
          {{ dossier.datasetCount }} {{ dossier.datasetCount === 1 ? 'dataset' : 'datasets' }} →
        </button>
      </div>

    </template>
  </main>
</template>

<style scoped>
.dossier-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

/* ── Back ── */
.back-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.9rem;
  color: var(--color-primary);
  cursor: pointer;
  margin-bottom: 1.75rem;
  display: inline-block;
  font-family: inherit;
}
.back-link:hover { color: var(--color-primary-dark); }

.state-msg {
  padding: 3rem;
  text-align: center;
  color: #6b7280;
}
.state-msg--error { color: #dc2626; }

/* ── Header ── */
.dossier-header {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 12px;
  border-top: 5px solid #f59e0b;
  color: #fff;
  padding: 2rem 2.25rem 1.75rem;
  margin-bottom: 2.25rem;
}

.header-eyebrow {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #f59e0b;
  margin: 0 0 0.5rem;
}

.header-title {
  font-size: 2rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.6rem;
  line-height: 1.2;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}

.header-run {
  font-size: 0.95rem;
  font-weight: 500;
  color: #e2e8f0;
}

.header-sep {
  color: #64748b;
}

.header-date {
  font-size: 0.88rem;
  color: #94a3b8;
}

.header-state {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 20px;
  letter-spacing: 0.04em;
}
.header-state--done { background: #14532d; color: #86efac; }
.header-state--active { background: #1e3a5f; color: #93c5fd; }

.header-workflow {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0;
}

/* ── Sections ── */
.dossier-section {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  padding: 1.5rem 1.75rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6b7280;
  margin: 0 0 1.25rem;
  padding-bottom: 0.6rem;
  border-bottom: 1px solid var(--color-border);
}

/* ── Activity timeline ── */
.timeline {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.timeline-arrow {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 0.6rem;
  color: #d1d5db;
  font-size: 1.1rem;
  align-self: center;
}

.act-card {
  flex: 1;
  min-width: 160px;
  max-width: 240px;
  border: 1px solid var(--color-border);
  border-left-width: 4px;
  border-radius: 8px;
  padding: 1rem 1rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  background: #fff;
}

.act-card--planned {
  border-left-color: #f59e0b;
  background: #fffdf7;
}

.act-card--plain {
  border-left-color: #e5e7eb;
}

.act-name {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
  line-height: 1.3;
}

.act-machine {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0;
  font-style: italic;
}

.act-params {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-top: 1px solid #fef3c7;
  padding-top: 0.5rem;
}

.act-param {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.param-label {
  color: #6b7280;
  flex-shrink: 0;
}

.param-value {
  font-weight: 600;
  color: #92400e;
  text-align: right;
}

.act-no-params {
  font-size: 0.75rem;
  color: #d1d5db;
  font-style: italic;
  margin: 0.4rem 0 0;
  padding-top: 0.5rem;
  border-top: 1px solid #f3f4f6;
}

/* ── Material lineage ── */
.lineage {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 1.1rem;
}

.lineage-node {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.65rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.lineage-node--part { background: #fef3c7; color: #92400e; }
.lineage-node--laminat { background: #dcfce7; color: #166534; }
.lineage-node--layup { background: #dbeafe; color: #1e40af; }
.lineage-node--tape { background: #ede9fe; color: #5b21b6; }

.ln-icon { font-size: 0.65rem; }
.ln-sub { font-size: 0.7rem; opacity: 0.75; }

.ln-arrow {
  color: #9ca3af;
  font-size: 0.85rem;
}

/* ── Material facts ── */
.mat-facts {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.mat-fact {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.mat-fact-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}

.mat-fact-value {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
}

/* ── Ply stack ── */
.ply-stack {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.ply-stack-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  flex-shrink: 0;
}

.ply-badges {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.ply-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

/* ── Footer navigation ── */
.dossier-footer {
  display: flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.footer-link {
  flex: 1;
  background: none;
  border: none;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: background 0.15s;
}

.footer-link:hover { background: #f0fdf4; }

.footer-link--datasets { color: #6b7280; }
.footer-link--datasets:hover { background: #f9fafb; color: var(--color-text); }

.footer-divider {
  width: 1px;
  height: 2.5rem;
  background: var(--color-border);
  flex-shrink: 0;
}
</style>

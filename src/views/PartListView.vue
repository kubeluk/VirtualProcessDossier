<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMaterialStore, type PartSummary, type PartDetail } from '@/stores/material'

const router = useRouter()
const materialStore = useMaterialStore()

const parts = ref<PartSummary[]>([])
const details = ref<Record<string, PartDetail | null>>({})
const detailLoading = ref<Record<string, boolean>>({})
const loading = ref(true)
const error = ref<string | null>(null)
const expanded = ref<Record<string, Set<string>>>({})

onMounted(async () => {
  try {
    const summaries = await materialStore.fetchParts()
    parts.value = summaries
    loading.value = false
    await Promise.all(
      summaries.map(async (p) => {
        detailLoading.value = { ...detailLoading.value, [p.uri]: true }
        try {
          const detail = await materialStore.fetchPartDetail(p)
          details.value = { ...details.value, [p.uri]: detail }
        } finally {
          detailLoading.value = { ...detailLoading.value, [p.uri]: false }
        }
      }),
    )
  } catch {
    error.value = 'Failed to load parts. Make sure the triple store is running.'
    loading.value = false
  }
})

function localName(uri: string): string {
  const m = uri.match(/[#/]([^#/]+)$/)
  return m ? m[1] : uri
}

function partLabel(uri: string): string {
  return `Part ${localName(uri)}`
}

function isExpanded(partUri: string, section: string): boolean {
  return expanded.value[partUri]?.has(section) ?? false
}

function toggleSection(partUri: string, section: string) {
  if (!expanded.value[partUri]) {
    expanded.value = { ...expanded.value, [partUri]: new Set() }
  }
  const s = new Set(expanded.value[partUri])
  if (s.has(section)) {
    s.delete(section)
  } else {
    s.add(section)
  }
  expanded.value = { ...expanded.value, [partUri]: s }
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

function tapeLabel(tapeId: string): string {
  return `Tape ${tapeId}`
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
      <RouterLink to="/workflows" class="nav-tab">Workflows</RouterLink>
      <RouterLink to="/activities" class="nav-tab">Activities</RouterLink>
      <RouterLink to="/systems" class="nav-tab">Systems</RouterLink>
      <RouterLink to="/parts" class="nav-tab nav-tab--active">Parts</RouterLink>
    </nav>

    <div v-if="loading" class="state-message">Loading parts…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <div v-else-if="parts.length === 0" class="state-message">No parts found in the triple store.</div>

    <ul v-else class="part-cards">
      <li v-for="part in parts" :key="part.uri" class="part-card">

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
              <span class="lineage-text">{{ part.laminatLabel ?? 'Laminat' }}</span>
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

        <!-- ── Collapsible sections ─────────────────────────────────── -->
        <div class="sections">

          <!-- Section 1: Laminat Properties -->
          <div class="section" :class="{ 'section--open': isExpanded(part.uri, 'props') }">
            <button class="section-toggle" @click="toggleSection(part.uri, 'props')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded(part.uri, 'props') }">▶</span>
              <span class="section-title">Laminat Properties</span>
              <span v-if="part.laminatLabel" class="section-hint">{{ part.laminatLabel }}</span>
            </button>
            <div v-if="isExpanded(part.uri, 'props')" class="section-body">
              <div v-if="detailLoading[part.uri]" class="section-loading">Loading…</div>
              <div v-else-if="details[part.uri]" class="props-grid">
                <dl class="prop-list">
                  <div class="prop-row" v-if="part.laminatLabel">
                    <dt>Material</dt>
                    <dd>{{ part.laminatLabel }}</dd>
                  </div>
                  <div class="prop-row" v-if="part.laminatId">
                    <dt>Identifier</dt>
                    <dd><code>{{ part.laminatId }}</code></dd>
                  </div>
                  <div class="prop-row" v-for="prop in details[part.uri]!.properties" :key="prop.kind">
                    <dt>{{ prop.kindLabel }}</dt>
                    <dd>{{ formatValue(prop.value) }}<span class="unit"> {{ prop.unitSymbol }}</span></dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <!-- Section 2: Ply Stack -->
          <div class="section" :class="{ 'section--open': isExpanded(part.uri, 'plies') }">
            <button class="section-toggle" @click="toggleSection(part.uri, 'plies')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded(part.uri, 'plies') }">▶</span>
              <span class="section-title">Ply Stack</span>
              <span v-if="part.layupLabel" class="section-hint">{{ part.layupLabel }}</span>
              <span v-if="details[part.uri]" class="section-count">{{ details[part.uri]!.plies.length }} layers</span>
            </button>
            <div v-if="isExpanded(part.uri, 'plies')" class="section-body">
              <div v-if="detailLoading[part.uri]" class="section-loading">Loading…</div>
              <div v-else-if="details[part.uri]">
                <p v-if="part.layupLabel" class="layup-notation">Layup notation: <strong>{{ part.layupLabel }}</strong></p>
                <table class="ply-table">
                  <thead>
                    <tr>
                      <th class="th-center">Layer</th>
                      <th>Tape</th>
                      <th>Fiber</th>
                      <th>Polymer</th>
                      <th class="th-center">Orientation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(ply, i) in details[part.uri]!.plies" :key="ply.tapeUri"
                        :class="{ 'row-even': i % 2 === 1 }">
                      <td class="td-center layer-num">{{ i + 1 }}</td>
                      <td class="td-mono">{{ tapeLabel(ply.tapeId) }}</td>
                      <td>{{ ply.fiberType ?? '—' }}</td>
                      <td>{{ ply.polymer ?? '—' }}</td>
                      <td class="td-center">
                        <span
                          class="orient-badge"
                          :style="{ background: orientBg(ply.orientation), color: orientFg(ply.orientation) }"
                        >
                          {{ ply.orientation !== null ? `${ply.orientation}°` : '—' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Section 3: Needle Points -->
          <div class="section section--last" :class="{ 'section--open': isExpanded(part.uri, 'needles') }">
            <button class="section-toggle" @click="toggleSection(part.uri, 'needles')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded(part.uri, 'needles') }">▶</span>
              <span class="section-title">Needle Points</span>
              <span v-if="details[part.uri]" class="section-count">{{ details[part.uri]!.needlePoints.length }} positions</span>
              <span class="section-hint">gripper contact coordinates</span>
            </button>
            <div v-if="isExpanded(part.uri, 'needles')" class="section-body">
              <div v-if="detailLoading[part.uri]" class="section-loading">Loading…</div>
              <div v-else-if="details[part.uri]" class="needle-layout">
                <!-- SVG footprint visualization -->
                <div class="needle-viz-wrap">
                  <svg class="needle-svg" viewBox="-215 -215 430 430" xmlns="http://www.w3.org/2000/svg">
                    <!-- Laminat footprint -->
                    <rect x="-200" y="-200" width="400" height="400"
                          fill="#f9fafb" stroke="#d1d5db" stroke-width="3" rx="3" />
                    <!-- Grid lines -->
                    <line x1="-200" y1="0" x2="200" y2="0" stroke="#e5e7eb" stroke-width="1.5" />
                    <line x1="0" y1="-200" x2="0" y2="200" stroke="#e5e7eb" stroke-width="1.5" />
                    <!-- Origin -->
                    <circle cx="0" cy="0" r="5" fill="#9ca3af" />
                    <!-- Axis labels -->
                    <text x="208" y="4" font-size="14" fill="#9ca3af" font-family="system-ui">X</text>
                    <text x="-4" y="-208" font-size="14" fill="#9ca3af" font-family="system-ui" text-anchor="end">Y</text>
                    <!-- Needle points -->
                    <g v-for="pt in details[part.uri]!.needlePoints" :key="pt.uri">
                      <circle :cx="pt.x" :cy="-pt.y" r="16" fill="#f59e0b" />
                      <text :x="pt.x" :y="-pt.y + 5"
                            text-anchor="middle" font-size="14"
                            font-weight="700" fill="white" font-family="system-ui">
                        {{ pt.pointId }}
                      </text>
                    </g>
                  </svg>
                  <p class="viz-caption">Origin: laminat center · coordinates in mm</p>
                </div>
                <!-- Coordinate table -->
                <table class="needle-table">
                  <thead>
                    <tr>
                      <th class="th-center">Pt.</th>
                      <th class="th-right">X (mm)</th>
                      <th class="th-right">Y (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(pt, i) in details[part.uri]!.needlePoints" :key="pt.uri"
                        :class="{ 'row-even': i % 2 === 1 }">
                      <td class="td-center">
                        <span class="needle-num">{{ pt.pointId }}</span>
                      </td>
                      <td class="td-right td-mono" :class="pt.x < 0 ? 'val-neg' : 'val-pos'">
                        {{ pt.x > 0 ? '+' : '' }}{{ formatValue(pt.x) }}
                      </td>
                      <td class="td-right td-mono" :class="pt.y < 0 ? 'val-neg' : 'val-pos'">
                        {{ pt.y > 0 ? '+' : '' }}{{ formatValue(pt.y) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

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

/* ── Collapsible sections ────────────────────────────────────────── */
.sections {
  display: flex;
  flex-direction: column;
}

.section {
  border-top: 1px solid var(--color-border);
}

.section--last {
  /* no extra border needed */
}

.section-toggle {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.85rem 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background 0.12s;
}

.section-toggle:hover {
  background: #fafafa;
}

.section--open .section-toggle {
  background: #f9fafb;
}

.toggle-arrow {
  font-size: 0.55rem;
  color: #9ca3af;
  transition: transform 0.18s;
  flex-shrink: 0;
}

.toggle-arrow--open {
  transform: rotate(90deg);
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text);
}

.section-hint {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-left: 0.1rem;
}

.section-count {
  font-size: 0.78rem;
  background: #f3f4f6;
  color: #4b5563;
  padding: 0.1rem 0.45rem;
  border-radius: 20px;
  font-weight: 600;
  border: 1px solid #e5e7eb;
}

.section-body {
  padding: 0 1.5rem 1.25rem;
  background: #fafafa;
  border-top: 1px solid var(--color-border);
}

.section-loading {
  padding: 1rem 0;
  font-size: 0.85rem;
  color: #9ca3af;
}

/* ── Laminat properties ──────────────────────────────────────────── */
.props-grid {
  padding-top: 1rem;
}

.prop-list {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0;
}

.prop-row {
  display: contents;
}

.prop-row dt,
.prop-row dd {
  padding: 0.45rem 0.75rem;
  font-size: 0.875rem;
  border-bottom: 1px solid #f0f0f0;
}

.prop-row:last-child dt,
.prop-row:last-child dd {
  border-bottom: none;
}

.prop-row dt {
  font-weight: 500;
  color: #6b7280;
  padding-left: 0;
  white-space: nowrap;
}

.prop-row dd {
  color: var(--color-text);
  margin: 0;
}

.prop-row dd code {
  font-family: monospace;
  font-size: 0.85em;
  background: #f3f4f6;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.unit {
  font-size: 0.8em;
  color: #9ca3af;
  margin-left: 0.15em;
}

/* ── Ply table ───────────────────────────────────────────────────── */
.layup-notation {
  font-size: 0.85rem;
  color: #6b7280;
  margin: 0.75rem 0 0.75rem;
}

.layup-notation strong {
  color: #1e40af;
  font-family: monospace;
  letter-spacing: 0.02em;
}

.ply-table,
.needle-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.ply-table th,
.needle-table th {
  padding: 0.5rem 0.75rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 2px solid #e5e7eb;
  background: #f9fafb;
}

.ply-table td,
.needle-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #f0f0f0;
  color: var(--color-text);
}

.ply-table tbody tr:last-child td,
.needle-table tbody tr:last-child td {
  border-bottom: none;
}

.row-even {
  background: #f9fafb;
}

.th-center,
.td-center {
  text-align: center !important;
}

.th-right,
.td-right {
  text-align: right !important;
}

.td-mono {
  font-family: monospace;
  font-size: 0.85em;
}

.layer-num {
  font-weight: 700;
  color: #6b7280;
  font-size: 0.8rem;
}

.orient-badge {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: monospace;
}

/* ── Needle points ───────────────────────────────────────────────── */
.needle-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
  padding-top: 1rem;
  flex-wrap: wrap;
}

.needle-viz-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.needle-svg {
  width: 200px;
  height: 200px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: white;
}

.viz-caption {
  font-size: 0.72rem;
  color: #9ca3af;
  margin: 0;
  text-align: center;
  max-width: 200px;
}

.needle-table {
  flex: 1;
  min-width: 160px;
}

.needle-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: #f59e0b;
  color: white;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
}

.val-pos { color: #065f46; }
.val-neg { color: #9f1239; }
</style>

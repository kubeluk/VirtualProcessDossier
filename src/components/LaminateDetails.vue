<script setup lang="ts">
import { ref } from 'vue'
import type { PartDetail } from '@/stores/material'
defineProps<{ detail: Pick<PartDetail, 'laminatLabel' | 'laminatId' | 'layupLabel' | 'properties' | 'plies' | 'needlePoints'> }>()
const expanded = ref(new Set<string>())
function isExpanded(section: string) { return expanded.value.has(section) }
function toggleSection(section: string) {
  if (expanded.value.has(section)) expanded.value.delete(section)
  else expanded.value.add(section)
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

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}
</script>
<template>
        <!-- ── Collapsible sections ─────────────────────────────────── -->
        <div class="sections">

          <!-- Section 1: Laminate Properties -->
          <div class="section" :class="{ 'section--open': isExpanded('props') }">
            <button class="section-toggle" :aria-expanded="isExpanded('props')" @click="toggleSection('props')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded('props') }">▶</span>
              <span class="section-title">Laminate Properties</span>
              <span v-if="detail.laminatLabel" class="section-hint">{{ detail.laminatLabel }}</span>
            </button>
            <div v-if="isExpanded('props')" class="section-body">
              <div v-if="detail" class="props-grid">
                <dl class="prop-list">
                  <div class="prop-row" v-if="detail.laminatLabel">
                    <dt>Material</dt>
                    <dd>{{ detail.laminatLabel }}</dd>
                  </div>
                  <div class="prop-row" v-if="detail.laminatId">
                    <dt>Identifier</dt>
                    <dd><code>{{ detail.laminatId }}</code></dd>
                  </div>
                  <div class="prop-row" v-for="prop in detail.properties" :key="prop.kind">
                    <dt>{{ prop.kindLabel }}</dt>
                    <dd>{{ formatValue(prop.value) }}<span class="unit"> {{ prop.unitSymbol }}</span></dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <!-- Section 2: Ply Stack -->
          <div class="section" :class="{ 'section--open': isExpanded('plies') }">
            <button class="section-toggle" @click="toggleSection('plies')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded('plies') }">▶</span>
              <span class="section-title">Ply Stack</span>
              <span v-if="detail.layupLabel" class="section-hint">{{ detail.layupLabel }}</span>
              <span v-if="detail" class="section-count">{{ detail.plies.length }} layers</span>
            </button>
            <div v-if="isExpanded('plies')" class="section-body">
              <div v-if="detail">
                <p v-if="detail.layupLabel" class="layup-notation">Layup notation: <strong>{{ detail.layupLabel }}</strong></p>
                <table class="ply-table">
                  <thead>
                    <tr>
                      <th class="th-center">Layer</th>
                      <th>Fiber</th>
                      <th>Polymer</th>
                      <th class="th-center">Fiber fraction</th>
                      <th class="th-center">Orientation</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(ply, i) in detail.plies" :key="ply.tapeUri"
                        :class="{ 'row-even': i % 2 === 1 }">
                      <td class="td-center layer-num">{{ i + 1 }}</td>
                      <td>{{ ply.fiberType ?? '—' }}</td>
                      <td>{{ ply.polymer ?? '—' }}</td>
                      <td class="td-center">
                        {{ ply.fiberMassFraction !== null ? ply.fiberMassFraction + ' %' : '—' }}
                      </td>
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
          <div class="section section--last" :class="{ 'section--open': isExpanded('needles') }">
            <button class="section-toggle" @click="toggleSection('needles')">
              <span class="toggle-arrow" :class="{ 'toggle-arrow--open': isExpanded('needles') }">▶</span>
              <span class="section-title">Needle Points</span>
              <span v-if="detail" class="section-count">{{ detail.needlePoints.length }} positions</span>
              <span class="section-hint">gripper contact coordinates</span>
            </button>
            <div v-if="isExpanded('needles')" class="section-body">
              <div v-if="detail" class="needle-layout">
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
                    <g v-for="pt in detail.needlePoints" :key="pt.uri">
                      <circle :cx="pt.x" :cy="-pt.y" r="16" fill="#f59e0b" />
                      <text :x="pt.x" :y="-pt.y + 5"
                            text-anchor="middle" font-size="14"
                            font-weight="700" fill="white" font-family="system-ui">
                        {{ pt.pointId }}
                      </text>
                    </g>
                  </svg>
                  <p class="viz-caption">Coordinates relative to the listed reference point · coordinates in mm</p>
                </div>
                <!-- Coordinate table -->
                <table class="needle-table">
                  <thead>
                    <tr>
                      <th class="th-center">Pt.</th>
                      <th>Reference point</th>
                      <th class="th-right">X (mm)</th>
                      <th class="th-right">Y (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(pt, i) in detail.needlePoints" :key="pt.uri"
                        :class="{ 'row-even': i % 2 === 1 }">
                      <td class="td-center">
                        <span class="needle-num">{{ pt.pointId }}</span>
                      </td>
                      <td>{{ pt.referenceLabel ?? pt.referenceUri }}</td>
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
</template>
<style scoped>
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

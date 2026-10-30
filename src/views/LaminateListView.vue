<script setup lang="ts">
import { computed, onMounted, ref, nextTick, watch } from 'vue'
import { useLaminateStore, type LaminateSummary } from '@/stores/laminate'
import { useRoute } from 'vue-router'
import LaminateDetails from '@/components/LaminateDetails.vue'
import type { PartDetail } from '@/stores/material'
import LaminateEditor from '@/components/LaminateEditor.vue'

const route = useRoute()
type Detail = Pick<
  PartDetail,
  'laminatLabel' | 'laminatId' | 'layupLabel' | 'properties' | 'plies' | 'needlePoints'
>
const details = ref<Record<string, Detail>>({})
const detailErrors = ref<Record<string, string>>({})
async function focusLaminate() {
  await nextTick()
  const uri = route.query.laminate
  if (typeof uri === 'string')
    document
      .getElementById(`laminate-${uri}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
watch(
  () => route.query.laminate,
  () => {
    search.value = ''
    focusLaminate()
  },
)
const store = useLaminateStore()
const laminates = ref<LaminateSummary[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const showEditor = ref(false)
const selected = ref<LaminateSummary | null>(null)
const filtered = computed(() =>
  laminates.value.filter((l) =>
    `${l.label} ${l.identifier}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
async function load() {
  loading.value = true
  error.value = ''
  try {
    laminates.value = await store.fetchLaminates()
    details.value = {}
    detailErrors.value = {}
    loading.value = false
    await focusLaminate()
    const forms = await store.fetchLaminateBatch(laminates.value.map((laminate) => laminate.uri))
    for (const laminate of laminates.value) {
      try {
        const form = forms[laminate.uri]
        if (!form) throw new Error('Missing laminate')
        details.value[laminate.uri] = {
          laminatLabel: form.label,
          laminatId: form.identifier,
          layupLabel: form.layupLabel,
          properties: (['length', 'width', 'thickness'] as const).flatMap((kind) =>
            form[kind] === null
              ? []
              : [
                  {
                    kind,
                    kindLabel: kind[0]!.toUpperCase() + kind.slice(1),
                    value: form[kind]!,
                    unitSymbol: 'mm',
                  },
                ],
          ),
          plies: form.plies.map((ply, i) => ({
            tapeUri: String(i),
            tapeId: String(i + 1),
            polymer: ply.polymer,
            fiberType: ply.fiberType,
            orientation: ply.orientation,
            fiberMassFraction: ply.massFraction,
          })),
          needlePoints: form.points.map((point, i) => ({
            uri: String(i),
            pointId: String(i + 1),
            x: point.x,
            y: point.y,
            referenceUri: point.referenceUri ?? '',
            referenceLabel: point.referenceLabel,
          })),
        }
      } catch {
        detailErrors.value[laminate.uri] = 'Could not load laminate details.'
      }
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown error'
    if (laminates.value.length) {
      for (const laminate of laminates.value) {
        detailErrors.value[laminate.uri] = `Could not load laminate details: ${message}`
      }
    } else {
      error.value = `Failed to load laminates: ${message}`
    }
  } finally {
    loading.value = false
    await focusLaminate()
  }
}
function open(laminate: LaminateSummary | null) {
  selected.value = laminate
  showEditor.value = true
}
function saved() {
  showEditor.value = false
  load()
}
onMounted(load)
</script>

<template>
  <main class="laminate-list">
    <header>
      <div>
        <h1>Laminates</h1>
        <p>Manage laminate dimensions, ply stacks, and needle points.</p>
      </div>
      <button class="primary" @click="open(null)">+ Add Laminate</button>
    </header>
    <nav class="page-nav" aria-label="Main navigation">
      <RouterLink to="/">Dossier</RouterLink><RouterLink to="/catalog">Datasets</RouterLink>
      <RouterLink to="/workflows">Workflows</RouterLink
      ><RouterLink to="/systems">Systems</RouterLink> <RouterLink to="/parts">Parts</RouterLink
      ><RouterLink to="/laminates" aria-current="page">Laminates</RouterLink>
    </nav>
    <label class="search"
      >Search laminates<input v-model="search" type="search" placeholder="Name or identifier"
    /></label>
    <p v-if="loading" class="state" role="status">Loading laminates…</p>
    <div v-else-if="error" class="state error" role="alert">
      {{ error }} <button @click="load">Retry</button>
    </div>
    <p v-else-if="!laminates.length" class="state">
      No laminates yet. Add a laminate to get started.
    </p>
    <p v-else-if="!filtered.length" class="state">No laminates match your search.</p>
    <ul v-else>
      <li
        v-for="laminate in filtered"
        :key="laminate.uri"
        :id="`laminate-${laminate.uri}`"
        :class="{ targeted: route.query.laminate === laminate.uri }"
      >
        <div class="card-heading">
          <h2>{{ laminate.label }}</h2>
          <p>Identifier: {{ laminate.identifier || '—' }}</p>
          <template v-if="details[laminate.uri]">
            <p>
              {{ details[laminate.uri]!.layupLabel }} ·
              {{ details[laminate.uri]!.plies.length }} layers ·
              {{ details[laminate.uri]!.needlePoints.length }} needle points
            </p>
            <p>
              <span
                v-for="prop in details[laminate.uri]!.properties"
                :key="prop.kind"
                class="dimension"
                >{{ prop.kindLabel }}: {{ prop.value }} {{ prop.unitSymbol }}</span
              >
            </p>
          </template>
        </div>
        <LaminateDetails v-if="details[laminate.uri]" :detail="details[laminate.uri]!" />
        <p v-if="detailErrors[laminate.uri]" class="error" role="alert">
          {{ detailErrors[laminate.uri] }}
        </p>
        <div class="card-actions">
          <button @click="open(laminate)">
            Edit laminate <span class="sr-only">{{ laminate.label }}</span> →
          </button>
        </div>
      </li>
    </ul>
    <LaminateEditor
      v-if="showEditor"
      :laminate="selected"
      @close="showEditor = false"
      @saved="saved"
    />
  </main>
</template>

<style scoped>
.laminate-list {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
h1 {
  font-size: 1.75rem;
}
h2 {
  font-size: 1.05rem;
}
p {
  color: #6b7280;
}
.page-nav {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-border);
  margin: 1.25rem 0 2rem;
}
.page-nav a {
  padding: 0.5rem 0.7rem;
  text-decoration: none;
  color: #6b7280;
  font-size: 0.85rem;
}
.page-nav a[aria-current] {
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-primary);
}
button,
input {
  padding: 0.5rem 0.8rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  font: inherit;
}
button {
  background: white;
  cursor: pointer;
  color: var(--color-primary);
  font-size: 0.875rem;
}
.primary {
  background: var(--color-primary);
  color: white;
}
.search {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
li {
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}
li p {
  font-size: 0.85rem;
  margin-top: 0.3rem;
}
.state {
  padding: 2rem;
  text-align: center;
}
.error {
  color: #dc2626;
}
.dimension {
  display: inline-block;
  margin-right: 1rem;
}
.card-heading,
.card-actions {
  padding: 0.25rem;
}
.card-actions {
  margin-top: 1rem;
  text-align: right;
}
li {
  scroll-margin-top: 1rem;
}
li.targeted {
  border-color: var(--color-primary);
}
ul {
  padding: 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>

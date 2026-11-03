<script setup lang="ts">
import { computed, ref, reactive, watch, onScopeDispose } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { repository } from '../services/repository'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { NS, dateTime, label } from '../domain/rdf'
import type { Filters, RunSummary, DatasetSummary } from '../domain/types'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import StateBadge from '../components/StateBadge.vue'
const props = defineProps<{ kind: 'runs' | 'datasets' }>()
const route = useRoute(),
  router = useRouter(),
  knowledge = useKnowledgeStore()
const keys = [
  'search',
  'state',
  'laminate',
  'model',
  'run',
  'sensor',
  'property',
  'feature',
  'media',
  'from',
  'to',
] as const
const filters = reactive<Filters>({})
function sync() {
  for (const key of keys) filters[key] = String(route.query[key] ?? '')
  filters.page = Math.max(0, Number(route.query.page) || 0)
}
sync()
watch(() => route.fullPath, sync)
const runs = ref<RunSummary[]>([]),
  datasets = ref<DatasetSummary[]>([]),
  total = ref(0)
const facets = ref<{ kind: string; uri: string; label: string }[]>([])
let serial = 0
const { loading, error, reload } = useLoad(async () => {
  const current = ++serial
  await knowledge.loadReferences()
  const [result, choices] = await Promise.all([
    props.kind === 'runs'
      ? repository.listRuns({ ...filters })
      : repository.listDatasets({ ...filters }),
    repository.facets(),
  ])
  if (current !== serial) return
  if (props.kind === 'runs') runs.value = result.items as RunSummary[]
  else datasets.value = result.items as DatasetSummary[]
  total.value = result.total
  facets.value = choices
}, [() => route.fullPath, () => knowledge.revision])
const active = computed(() => keys.filter((k) => !!filters[k]))
const facetOptions = (kind: string) => facets.value.filter((f) => f.kind === kind)
function apply(page = 0) {
  const query: Record<string, string> = {}
  for (const key of keys) if (filters[key]) query[key] = String(filters[key])
  if (page) query.page = String(page)
  void router.replace({ path: route.path, query })
}
let timer: ReturnType<typeof setTimeout>
onScopeDispose(() => clearTimeout(timer))
function search() {
  clearTimeout(timer)
  timer = setTimeout(() => apply(), 350)
}
function reset() {
  for (const key of keys) filters[key] = ''
  apply()
}
function removeFilter(key: (typeof keys)[number]) {
  filters[key] = ''
  apply()
}
</script>
<template>
  <div class="page-heading heading-with-action">
    <div>
      <p class="eyebrow">
        {{ kind === 'runs' ? 'Preparation & history' : 'Measurement discovery' }}
      </p>
      <h1>{{ kind === 'runs' ? 'Production runs' : 'Datasets' }}</h1>
      <p class="lede">
        {{
          kind === 'runs'
            ? 'Find a run and follow its manufacturing context.'
            : 'Find recorded data and understand where it came from.'
        }}
      </p>
    </div>
    <RouterLink v-if="kind === 'runs'" to="/runs/new" class="button primary"
      >＋ Prepare a run</RouterLink
    >
  </div>
  <form class="panel filter-panel" role="search" @submit.prevent="apply()">
    <label class="search-field"
      ><span class="sr-only">Search {{ kind === 'runs' ? 'runs' : 'datasets' }}</span
      ><span aria-hidden="true">⌕</span
      ><input
        v-model="filters.search"
        type="search"
        :placeholder="
          kind === 'runs'
            ? 'Search run names and notes…'
            : 'Search dataset titles and descriptions…'
        "
        @input="search"
    /></label>
    <div class="filter-grid">
      <template v-if="kind === 'runs'">
        <label
          >State<select v-model="filters.state" @change="apply()">
            <option value="">All states</option>
            <option :value="NS.wild + 'initialized'">Initialized</option>
            <option :value="NS.wild + 'done'">Completed</option>
            <option :value="NS.wild + 'active'">Active</option>
          </select></label
        >
        <label
          >Laminate<select v-model="filters.laminate" @change="apply()">
            <option value="">All laminates</option>
            <option v-for="f in facetOptions('laminate')" :key="f.uri" :value="f.uri">
              {{ f.label }}
            </option>
          </select></label
        >
        <label
          >From execution date<input v-model="filters.from" type="date" @change="apply()" /></label
        ><label
          >Through execution date<input v-model="filters.to" type="date" @change="apply()"
        /></label>
      </template>
      <template v-else>
        <label
          v-for="field in [
            { key: 'run', name: 'Production run' },
            { key: 'sensor', name: 'Sensor' },
            { key: 'property', name: 'Observed property' },
            { key: 'feature', name: 'Observed entity' },
            { key: 'media', name: 'Media type' },
          ]"
          :key="field.key"
          >{{ field.name
          }}<select v-model="filters[field.key as keyof Omit<Filters, 'page'>]" @change="apply()">
            <option value="">All</option>
            <option v-for="f in facetOptions(field.key)" :key="f.uri" :value="f.uri">
              {{ f.label }}
            </option>
          </select></label
        >
      </template>
      <label
        >Process<select v-model="filters.model" @change="apply()">
          <option value="">All processes</option>
          <option v-for="f in facetOptions('model')" :key="f.uri" :value="f.uri">
            {{ f.label }}
          </option>
        </select></label
      >
    </div>
    <div v-if="active.length" class="filter-chips">
      <button
        v-for="key in active"
        :key="key"
        type="button"
        class="filter-chip"
        @click="removeFilter(key)"
      >
        {{ key }}:
        {{
          key === 'search' || key === 'from' || key === 'to' || key === 'media'
            ? filters[key]
            : label(knowledge.references, filters[key])
        }}
        ×</button
      ><button type="button" class="text-button" @click="reset">Clear all</button>
    </div>
  </form>
  <AsyncState :loading="loading" :error="error" :empty="total === 0" @retry="reload">
    <template #empty
      ><h3>No {{ kind === 'runs' ? 'runs' : 'datasets' }} match this view.</h3>
      <p>Try changing the filters, or refresh after new records are added.</p>
      <button v-if="active.length" class="button secondary" @click="reset">
        Clear filters
      </button></template
    >
    <div class="section-heading results-heading">
      <p>{{ total }} {{ kind === 'runs' ? 'production runs' : 'datasets' }}</p>
      <span class="small muted">Page {{ (filters.page || 0) + 1 }}</span>
    </div>
    <div v-if="kind === 'runs'" class="panel table-panel">
      <div class="table-scroll">
        <table class="run-table">
          <thead>
            <tr>
              <th>Production run</th>
              <th>Input laminate</th>
              <th>State</th>
              <th>Recorded start</th>
              <th>Datasets</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs" :key="run.uri">
              <td>
                <EntityLink :uri="run.uri" :text="run.label" kind="run" /><small>{{
                  run.modelLabel
                }}</small>
              </td>
              <td><EntityLink :uri="run.laminate" :text="run.laminateLabel" kind="laminate" /></td>
              <td><StateBadge :state="run.state" /></td>
              <td>{{ dateTime(run.start) }}</td>
              <td>{{ run.datasetCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="card-grid">
      <article v-for="dataset in datasets" :key="dataset.uri" class="panel dataset-card">
        <p class="eyebrow">{{ dataset.media || 'Dataset' }}</p>
        <h2><EntityLink :uri="dataset.uri" :text="dataset.label" kind="dataset" /></h2>
        <p>{{ dataset.description || 'Description not recorded.' }}</p>
        <dl class="compact-facts">
          <dt>Run</dt>
          <dd><EntityLink :uri="dataset.run" kind="run" /></dd>
          <dt>Sensor</dt>
          <dd><EntityLink :uri="dataset.sensor" kind="equipment" /></dd>
          <dt>Measured property</dt>
          <dd><EntityLink :uri="dataset.property" /></dd>
        </dl>
        <div class="card-bottom">
          <span class="small muted">{{
            dataset.run ? 'Process context available' : 'Run context not recorded'
          }}</span>
        </div>
      </article>
    </div>
    <div class="pagination">
      <button
        class="button secondary"
        :disabled="!filters.page"
        @click="apply((filters.page || 0) - 1)"
      >
        ← Previous</button
      ><span
        >{{ (filters.page || 0) * 12 + 1 }}–{{ Math.min(((filters.page || 0) + 1) * 12, total) }} of
        {{ total }}</span
      ><button
        class="button secondary"
        :disabled="((filters.page || 0) + 1) * 12 >= total"
        @click="apply((filters.page || 0) + 1)"
      >
        Next →
      </button>
    </div>
  </AsyncState>
</template>

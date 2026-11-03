<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { NS, typed, subjects, value, label, isType } from '../domain/rdf'
import { repository } from '../services/repository'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import EquipmentTree from '../components/EquipmentTree.vue'
import AllMetadata from '../components/AllMetadata.vue'
import LaminateSummary from '../components/LaminateSummary.vue'
const props = defineProps<{ kind: 'laminates' | 'equipment' }>()
const route = useRoute(),
  router = useRouter(),
  knowledge = useKnowledgeStore()
const search = ref(String(route.query.search ?? '')),
  observations = ref<{ uri: string; run: string; property: string }[]>([]),
  observationPage = ref(0)
const uri = computed(() => String(route.query.uri ?? ''))
watch(
  () => route.fullPath,
  () => {
    search.value = String(route.query.search ?? '')
    observationPage.value = 0
  },
)
const g = computed(() => knowledge.references)
const all = computed(() =>
  props.kind === 'laminates'
    ? typed(g.value, NS.for + 'Laminate')
    : [
        ...new Map(
          [NS.ssn + 'System', NS.sosa + 'Sensor', NS.sosa + 'Actuator']
            .flatMap((t) => typed(g.value, t))
            .map((t) => [t.value, t]),
        ).values(),
      ],
)
const entries = computed(() =>
  all.value.filter(
    (t) =>
      !search.value ||
      (label(g.value, t) + ' ' + t.value + ' ' + value(g.value, t, NS.dct + 'identifier'))
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
)
const roots = computed(() =>
  entries.value.filter(
    (t) => search.value || !subjects(g.value, NS.ssn + 'hasSubSystem', t).length,
  ),
)
const { loading, error, reload } = useLoad(async () => {
  await knowledge.loadReferences()
  observations.value = []
  if (uri.value && props.kind === 'equipment') {
    const { safeIri } = await import('../domain/rdf')
    const rows = await repository.select(`SELECT DISTINCT ?obs ?run ?property WHERE {
      ?obs a sosa:Observation .
      { ?obs sosa:madeBySensor ${safeIri(uri.value)} } UNION { ?obs sosa:hasFeatureOfInterest ${safeIri(uri.value)} }
      OPTIONAL { ?obs wild:inWorkflowInstance ?run } OPTIONAL { ?obs sosa:observedProperty ?property }
    } ORDER BY STR(?obs) LIMIT 25 OFFSET ${observationPage.value * 25}`)
    observations.value = rows.map((b) => ({
      uri: b.obs!.value,
      run: b.run?.value ?? '',
      property: b.property?.value ?? '',
    }))
  }
}, [() => route.fullPath, () => knowledge.revision, () => observationPage.value])
function setSearch() {
  void router.replace({ query: { search: search.value || undefined } })
}
</script>
<template>
  <div class="page-heading">
    <p class="eyebrow">
      {{ kind === 'laminates' ? 'Material traceability' : 'Systems & sensors' }}
    </p>
    <h1>{{ uri ? label(g, uri) : kind === 'laminates' ? 'Laminates' : 'Equipment' }}</h1>
    <p class="lede">
      {{
        uri
          ? value(g, uri, NS.rdfs + 'comment')
          : kind === 'laminates'
            ? 'Understand the material behind a run.'
            : 'Explore the equipment and sensors that give measurements their meaning.'
      }}
    </p>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="reload">
    <template v-if="!uri">
      <form class="panel search-only" role="search" @submit.prevent="setSearch">
        <label class="search-field"
          ><span class="sr-only">Search {{ kind }}</span
          ><input
            v-model="search"
            type="search"
            :placeholder="'Search ' + kind + '…'"
            @input="setSearch"
        /></label>
      </form>
      <p class="small muted results-heading">
        {{ entries.length }} registered
        {{ kind === 'laminates' ? 'laminates' : 'systems and sensors' }}
      </p>
      <div v-if="kind === 'laminates'" class="card-grid">
        <article v-for="entry in entries" :key="entry.value" class="panel">
          <p class="eyebrow">{{ value(g, entry, NS.dct + 'identifier') || 'Laminate' }}</p>
          <h2><EntityLink :uri="entry.value" kind="laminate" /></h2>
          <LaminateSummary :uri="entry.value" /><RouterLink
            :to="{ path: '/laminate', query: { uri: entry.value } }"
            class="button secondary"
            >Explore laminate →</RouterLink
          >
        </article>
      </div>
      <section v-else class="panel">
        <ul class="equipment-tree">
          <EquipmentTree v-for="entry in roots" :key="entry.value" :uri="entry.value" :graph="g" />
        </ul>
      </section>
      <p v-if="!entries.length" class="notice">No matching records.</p>
    </template>
    <template v-else-if="all.some((t) => t.value === uri)">
      <RouterLink to="/equipment" class="back-link">← All equipment</RouterLink>
      <section class="panel">
        <p class="eyebrow">{{ isType(g, uri, NS.sosa + 'Sensor') ? 'Sensor' : 'System' }}</p>
        <div class="section-heading">
          <h2>Equipment context</h2>
          <RouterLink
            :to="{
              path: '/datasets',
              query: isType(g, uri, NS.sosa + 'Sensor') ? { sensor: uri } : { feature: uri },
            }"
            >Find related datasets →</RouterLink
          >
        </div>
        <p v-if="subjects(g, NS.ssn + 'hasSubSystem', uri).length">
          Part of:
          <EntityLink
            v-for="parent in subjects(g, NS.ssn + 'hasSubSystem', uri)"
            :key="parent.value"
            :uri="parent.value"
            :graph="g"
          />
        </p>
        <p v-if="value(g, uri, NS.for + 'takesParameters')">
          Accepted initialization parameters:
          <EntityLink :uri="value(g, uri, NS.for + 'takesParameters')" :graph="g" />
        </p>
        <ul class="equipment-tree">
          <EquipmentTree :uri="uri" :graph="g" />
        </ul>
      </section>
      <section class="panel">
        <h2>Recorded observations</h2>
        <p class="muted small">
          Observations made by this sensor or directly measuring this equipment.
        </p>
        <div v-for="obs in observations" :key="obs.uri" class="related-row">
          <EntityLink :uri="obs.uri" text="Open observation" /><EntityLink
            :uri="obs.property"
          /><EntityLink :uri="obs.run" kind="run" />
        </div>
        <p v-if="!observations.length" class="muted">
          No further observations recorded for this equipment.
        </p>
        <div class="pagination">
          <button
            class="button secondary"
            :disabled="observationPage === 0"
            @click="observationPage--"
          >
            Previous</button
          ><span>Page {{ observationPage + 1 }}</span
          ><button
            class="button secondary"
            :disabled="observations.length < 25"
            @click="observationPage++"
          >
            More observations
          </button>
        </div>
      </section>
      <AllMetadata :uri="uri" />
    </template>
    <p v-else class="notice">
      Equipment not found. <RouterLink to="/equipment">Browse registered equipment</RouterLink>
    </p>
  </AsyncState>
</template>

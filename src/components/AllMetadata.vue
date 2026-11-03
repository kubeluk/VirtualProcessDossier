<script setup lang="ts">
import { computed, shallowRef, ref, watch } from 'vue'
import { Store, n, merge, human, objects } from '../domain/rdf'
import { repository } from '../services/repository'
import { useKnowledgeStore } from '../stores/knowledge'
import MetadataValue from './MetadataValue.vue'
const props = defineProps<{ uri: string; expanded?: boolean }>()
const knowledge = useKnowledgeStore(),
  data = shallowRef(new Store()),
  loading = ref(false),
  error = ref(''),
  open = ref(false),
  page = ref(0)
const graph = computed(() => merge(knowledge.references, data.value))
const predicates = computed(() =>
  [
    ...new Set(data.value.getQuads(n(props.uri), null, null, null).map((q) => q.predicate.value)),
  ].sort(),
)
const incoming = computed(() => data.value.getQuads(null, null, n(props.uri), null))
async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await repository.getEntityMetadata(props.uri, page.value)
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}
watch(
  () => props.uri,
  () => {
    page.value = 0
    data.value = new Store()
    if (open.value) void load()
  },
)
watch(
  () => knowledge.revision,
  () => {
    if (open.value) void load()
  },
)
function toggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
  if (open.value && !data.value.size) void load()
}
function changePage(direction: number) {
  page.value += direction
  void load()
}
</script>
<template>
  <details class="panel metadata-panel" :open="expanded" @toggle="toggle">
    <summary>All metadata & related records</summary>
    <p class="muted small">
      Explore the information recorded for this entity. Linked records open their own context.
    </p>
    <p class="resource-id">{{ uri }}</p>
    <p v-if="loading" role="status">Loading metadata…</p>
    <div v-else-if="error" class="error" role="alert">
      {{ error }} <button class="button secondary" @click="load">Retry</button>
    </div>
    <template v-else-if="open">
      <dl class="metadata-list">
        <template v-for="predicate in predicates" :key="predicate">
          <dt :title="predicate">{{ human(predicate) }}</dt>
          <dd>
            <div v-for="(item, index) in objects(data, uri, predicate)" :key="index">
              <MetadataValue :graph="graph" :term="item" :ancestors="[uri]" />
            </div>
          </dd>
        </template>
      </dl>
      <h3>Records referring to this entity</h3>
      <ul class="related-list">
        <li v-for="(quad, index) in incoming" :key="index">
          <MetadataValue :graph="graph" :term="quad.subject" />
          <span class="muted">· {{ human(quad.predicate.value) }}</span>
        </li>
      </ul>
      <p v-if="!incoming.length" class="muted">No further referring records.</p>
      <div class="pagination">
        <button class="button secondary" :disabled="page === 0" @click="changePage(-1)">
          Previous</button
        ><span>Page {{ page + 1 }}</span
        ><button class="button secondary" :disabled="incoming.length < 50" @click="changePage(1)">
          More related records
        </button>
      </div>
      <p class="small muted">
        Times are shown in your browser’s local time zone. Values retain their recorded units.
      </p>
    </template>
  </details>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { NS, objects, object, list, human, compact, quantity } from '../domain/rdf'
import type { Store, Term } from '../domain/rdf'
import EntityLink from './EntityLink.vue'
const props = withDefaults(defineProps<{ graph: Store; term: Term; ancestors?: string[] }>(), {
  ancestors: () => [],
})
const open = ref(false)
const cycle = computed(() => props.ancestors.includes(props.term.value))
const isList = computed(
  () => !!object(props.graph, props.term, NS.rdf + 'first') || props.term.value === NS.rdf + 'nil',
)
const listResult = computed(() => {
  try {
    return { items: list(props.graph, props.term), error: '' }
  } catch (e) {
    return { items: [], error: String(e) }
  }
})
const properties = computed(() => [
  ...new Set(props.graph.getQuads(props.term, null, null, null).map((q) => q.predicate.value)),
])
const q = computed(() =>
  object(props.graph, props.term, NS.qudt + 'value')
    ? quantity(props.graph, props.term)
    : undefined,
)
</script>
<template>
  <span v-if="term.termType === 'Literal'" class="literal"
    >{{ term.value }}<small v-if="term.language" class="muted"> [{{ term.language }}]</small>
    <details class="literal-type">
      <summary>Value type</summary>
      {{ compact(term.datatype.value) }}
    </details></span
  >
  <EntityLink
    v-else-if="term.termType === 'NamedNode' && !isList"
    :uri="term.value"
    :graph="graph"
  />
  <span v-else-if="cycle" class="muted">Already shown above</span>
  <details
    v-else
    class="nested-metadata"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary>{{ isList ? 'Ordered list' : q ? q.value + ' ' + q.unit : 'Details' }}</summary>
    <template v-if="open">
      <p v-if="isList && listResult.error" class="error">{{ listResult.error }}</p>
      <ol v-else-if="isList">
        <li v-for="(item, index) in listResult.items" :key="index">
          <MetadataValue :graph="graph" :term="item" :ancestors="[...ancestors, term.value]" />
        </li>
      </ol>
      <dl v-else class="metadata-list">
        <template v-for="predicate in properties" :key="predicate">
          <dt :title="predicate">{{ human(predicate) }}</dt>
          <dd>
            <div v-for="(item, index) in objects(graph, term, predicate)" :key="index">
              <MetadataValue :graph="graph" :term="item" :ancestors="[...ancestors, term.value]" />
            </div>
          </dd>
        </template>
      </dl>
    </template>
  </details>
</template>

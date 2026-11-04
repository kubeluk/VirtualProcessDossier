<script setup lang="ts">
import { computed, ref } from 'vue'
import { NS, objects, object, list, human, compact, quantity } from '../domain/rdf'
import type { Store, Term } from '../domain/rdf'
import EntityLink from './EntityLink.vue'
import { formatNumber } from '../utils/formatNumber'
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
const quantitySummary = computed(() =>
  q.value
    ? [q.value.value.split(', ').map(formatNumber).join(', '), q.value.unit]
        .filter(Boolean)
        .join(' ')
    : 'Details',
)
const literalDisplay = computed(() => {
  const term = props.term
  if (
    term.termType === 'Literal' &&
    /^http:\/\/www\.w3\.org\/2001\/XMLSchema#(?:decimal|double|float|integer|int|long|short|byte|nonPositiveInteger|negativeInteger|nonNegativeInteger|positiveInteger|unsignedLong|unsignedInt|unsignedShort|unsignedByte)$/.test(
      term.datatype.value,
    )
  )
    return formatNumber(term.value)
  return term.value
})
</script>
<template>
  <span v-if="term.termType === 'Literal'" class="literal"
    >{{ literalDisplay }}<small v-if="term.language" class="muted"> [{{ term.language }}]</small>
    <details class="literal-type">
      <summary>Value type</summary>
      {{ compact(term.datatype.value) }}
      <div v-if="literalDisplay !== term.value">Recorded value: {{ term.value }}</div>
    </details></span
  >
  <EntityLink
    v-else-if="term.termType === 'NamedNode' && !isList && !q"
    :uri="term.value"
    :graph="graph"
  />
  <span v-else-if="cycle" class="muted">Already shown above</span>
  <details
    v-else
    class="nested-metadata"
    @toggle="open = ($event.target as HTMLDetailsElement).open"
  >
    <summary>{{ isList ? 'Ordered list' : quantitySummary }}</summary>
    <template v-if="open">
      <p v-if="term.termType === 'NamedNode'">
        <EntityLink :uri="term.value" :graph="graph" text="Open record" />
      </p>
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

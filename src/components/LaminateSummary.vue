<script setup lang="ts">
import { computed } from 'vue'
import { useKnowledgeStore } from '../stores/knowledge'
import { NS, objects, object, value, quantity, human, list, label } from '../domain/rdf'
import EntityLink from './EntityLink.vue'
import PositionPlot from './PositionPlot.vue'
const props = defineProps<{ uri: string; expanded?: boolean }>()
const knowledge = useKnowledgeStore()
const g = computed(() => knowledge.references)
const layup = computed(() => object(g.value, props.uri, NS.prov + 'wasDerivedFrom'))
const layers = computed(() => {
  try {
    return { items: list(g.value, object(g.value, layup.value, NS.param + 'tapeStack')), error: '' }
  } catch (e) {
    return { items: [], error: String(e) }
  }
})
const orientation = (tape: string) => {
  const derivation =
    layup.value &&
    objects(g.value, layup.value, NS.prov + 'qualifiedDerivation').find(
      (d) => value(g.value, d, NS.prov + 'entity') === tape,
    )
  return quantity(g.value, object(g.value, derivation || undefined, NS.param + 'fiberOrientation'))
}
const needles = computed(() =>
  objects(g.value, props.uri, NS.param + 'hasNeedlePoint').map((point, index) => {
    const q = object(g.value, point, NS.qudt + 'quantityValue')
    let coordinates: string[] = []
    try {
      coordinates = list(g.value, object(g.value, q, NS.qudt + 'value')).map((t) => t.value)
    } catch {
      /* Metadata retains malformed records. */
    }
    return {
      iri: point.value,
      name: 'Needle point ' + (index + 1),
      x: coordinates[0] ?? '',
      y: coordinates[1] ?? '',
      reference: value(g.value, point, NS.param + 'referencePoint'),
      unit: quantity(g.value, q).unit,
    }
  }),
)
</script>
<template>
  <div class="laminate-summary">
    <div class="fact-strip">
      <div v-for="size in objects(g, uri, NS.geo + 'hasSize')" :key="size.value">
        <small>{{ human(quantity(g, size).kind) }}</small
        ><strong
          >{{ quantity(g, size).value }} <span>{{ quantity(g, size).unit }}</span></strong
        >
      </div>
    </div>
    <details class="disclosure" :open="expanded">
      <summary>
        Material & ordered layup <span class="muted">{{ layup ? label(g, layup) : '' }}</span>
      </summary>
      <p>Layup: <EntityLink :uri="layup?.value" :graph="g" /></p>
      <p v-if="layers.error" class="error">{{ layers.error }}</p>
      <div v-else-if="layers.items.length" class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Layer</th>
              <th>Tape</th>
              <th>Orientation</th>
              <th>Polymer</th>
              <th>Fiber</th>
              <th>Fiber mass fraction</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(tape, index) in layers.items" :key="index">
              <th>{{ index + 1 }}</th>
              <td><EntityLink :uri="tape.value" :graph="g" /></td>
              <td>
                {{ orientation(tape.value).value || 'Not recorded' }}
                {{ orientation(tape.value).unit }}
              </td>
              <td>{{ value(g, tape, NS.param + 'polymer') || 'Not recorded' }}</td>
              <td>{{ value(g, tape, NS.param + 'fiberType') || 'Not recorded' }}</td>
              <td>
                {{ quantity(g, object(g, tape, NS.param + 'hasFiberMassFraction')).value }}
                {{ quantity(g, object(g, tape, NS.param + 'hasFiberMassFraction')).unit }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted">The tape stack is not recorded.</p>
    </details>
    <details class="disclosure" :open="expanded">
      <summary>
        Needle points <span class="muted">{{ needles.length }} recorded</span>
      </summary>
      <PositionPlot
        :points="needles"
        title="Laminate needle points"
        reference="Laminate reference"
      />
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Point</th>
              <th>X</th>
              <th>Y</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="point in needles" :key="point.iri">
              <td><EntityLink :uri="point.iri" :text="point.name" :graph="g" /></td>
              <td>{{ point.x || 'Not recorded' }} {{ point.unit }}</td>
              <td>{{ point.y || 'Not recorded' }} {{ point.unit }}</td>
              <td><EntityLink :uri="point.reference" :graph="g" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { executionPlans } from '../domain/model'
import { usedParameterGroups } from '../domain/parameters'
import { NS, objects, type Store, type Term } from '../domain/rdf'
import EntityLink from './EntityLink.vue'
import MetadataValue from './MetadataValue.vue'
const props = defineProps<{ graph: Store; activity: Term | string }>()
const records = computed(() =>
  executionPlans(props.graph, props.activity).map((record) => {
    try {
      return {
        ...record,
        groups: usedParameterGroups(props.graph, props.activity, record.plan),
        error: '',
      }
    } catch (error) {
      return {
        ...record,
        groups: [],
        error: error instanceof Error ? error.message : 'Invalid recorded parameters.',
      }
    }
  }),
)
</script>
<template>
  <div class="execution-parameters">
    <p v-if="!records.length" class="small muted">No used settings recorded.</p>
    <details
      v-for="(record, index) in records"
      :key="record.association.value + record.plan.value"
      class="disclosure"
    >
      <summary>
        {{
          records.length > 1 ? 'Recorded used settings ' + (index + 1) : 'Recorded used settings'
        }}
      </summary>
      <p class="small">
        Recorded equipment:
        <EntityLink
          v-for="equipment in record.equipment"
          :key="equipment.value"
          :uri="equipment.value"
          :graph="graph"
        />
        <span v-if="!record.equipment.length" class="muted">Not recorded</span>
      </p>
      <p class="small muted">Settings reported by the shop floor for this execution.</p>
      <p v-if="record.error" class="error">{{ record.error }}</p>
      <div v-for="group in record.groups" :key="group.name">
        <h4>{{ group.name }}</h4>
        <p v-if="!group.rows.length" class="small muted">Not recorded</p>
        <dl class="compact-facts">
          <template v-for="(row, rowIndex) in group.rows" :key="rowIndex">
            <dt>
              <EntityLink v-if="row.component" :uri="row.component.value" :graph="graph" /><template
                v-else
                >{{ row.name }}</template
              >
            </dt>
            <dd>
              <span v-if="!row.quantities.length" class="muted">Not recorded</span>
              <div v-for="(quantity, quantityIndex) in row.quantities" :key="quantityIndex">
                <MetadataValue
                  v-if="objects(graph, quantity, NS.qudt + 'value').length"
                  :graph="graph"
                  :term="quantity"
                />
                <span v-else class="muted">Value not recorded</span>
              </div>
            </dd>
          </template>
        </dl>
      </div>
      <details class="disclosure small">
        <summary>Full plan metadata</summary>
        <MetadataValue :graph="graph" :term="record.plan" />
      </details>
    </details>
  </div>
</template>

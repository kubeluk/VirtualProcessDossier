<script setup lang="ts">
import { objects, NS, isType } from '../domain/rdf'
import type { Store } from '../domain/rdf'
import EntityLink from './EntityLink.vue'
withDefaults(defineProps<{ graph: Store; uri: string; ancestors?: string[] }>(), {
  ancestors: () => [],
})
</script>
<template>
  <li>
    <div class="equipment-tree-label">
      <EntityLink :uri="uri" :graph="graph" kind="equipment" />
    </div>
    <span v-if="ancestors.includes(uri)" class="muted small">Repeated reference</span>
    <details
      v-else-if="objects(graph, uri, NS.ssn + 'hasSubSystem').length"
      :open="ancestors.length === 0"
    >
      <summary>
        {{ objects(graph, uri, NS.ssn + 'hasSubSystem').length }} subsystems & sensors
      </summary>
      <ul class="equipment-tree">
        <EquipmentTree
          v-for="child in objects(graph, uri, NS.ssn + 'hasSubSystem')"
          :key="child.value"
          :uri="child.value"
          :graph="graph"
          :ancestors="[...ancestors, uri]"
        />
      </ul>
    </details>
    <span v-else class="small muted">{{
      isType(graph, uri, NS.sosa + 'Sensor') ? 'Sensor' : 'No subsystems recorded'
    }}</span>
  </li>
</template>

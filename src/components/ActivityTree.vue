<script setup lang="ts">
import { computed } from 'vue'
import { NS, objects, value, object, dateTime, interval, label } from '../domain/rdf'
import type { Store } from '../domain/rdf'
import type { ActivityNode } from '../domain/types'
import { instancesFor, datasetsFor } from '../domain/model'
import { observationExpectations } from '../domain/expectations'
import EntityLink from './EntityLink.vue'
import StateBadge from './StateBadge.vue'
const props = withDefaults(
  defineProps<{
    node: ActivityNode
    graph: Store
    run?: string
    depth?: number
    selected?: string
  }>(),
  { depth: 0, run: '', selected: '' },
)
const instances = computed(() =>
  props.run ? instancesFor(props.graph, props.run, props.node.uri) : [],
)
const grouped = computed(() => props.node.uri === NS.activity + 'gripAndObserve')
const children = computed(() =>
  grouped.value
    ? props.node.children.filter((child) => !observationExpectations.has(child.uri))
    : props.node.children,
)
const groups = computed(() =>
  grouped.value
    ? ['Gripper angle', 'Gripper force', 'Gripper extension'].map((group) => ({
        name: group,
        children: props.node.children.filter(
          (child) => observationExpectations.get(child.uri)?.group === group,
        ),
      }))
    : [],
)
const expectation = computed(() => observationExpectations.get(props.node.uri))
function containsSelected(node: ActivityNode): boolean {
  return (
    node.uri === props.selected ||
    (!!props.run &&
      instancesFor(props.graph, props.run, node.uri).some((t) => t.value === props.selected)) ||
    node.children.some(containsSelected)
  )
}
const opened = computed(
  () =>
    containsSelected(props.node) ||
    props.depth === 0 ||
    (props.depth === 1 && props.node.type === 'sequential'),
)
const datasets = (uri: string) => datasetsFor(props.graph, uri)
</script>
<template>
  <details
    class="activity-node"
    :class="[node.type, { selected: containsSelected(node) }]"
    :open="opened"
  >
    <summary>
      <span class="activity-symbol" aria-hidden="true">{{
        node.type === 'parallel' ? '⇉' : node.type === 'sequential' ? '↓' : expectation ? '◉' : '•'
      }}</span
      ><span class="activity-title">{{ node.label }}</span
      ><span v-if="node.type !== 'atomic'" class="small muted">{{
        node.type === 'parallel' ? 'Parallel group' : 'Sequential group'
      }}</span
      ><StateBadge
        v-if="run && instances.length === 1"
        :state="value(graph, instances[0], NS.wild + 'hasState')"
      /><span v-else-if="run && !instances.length" class="badge">No execution record</span
      ><span v-else-if="instances.length > 1" class="badge">{{ instances.length }} instances</span>
    </summary>
    <div class="activity-body">
      <p v-if="value(graph, node.uri, NS.rdfs + 'comment')" class="small muted">
        {{ value(graph, node.uri, NS.rdfs + 'comment') }}
      </p>
      <p v-if="object(graph, node.uri, NS.ssn + 'implementedBy')" class="small">
        Specified equipment:
        <EntityLink :uri="value(graph, node.uri, NS.ssn + 'implementedBy')" :graph="graph" />
      </p>
      <p v-if="node.type === 'parallel'" class="small muted">
        These activities belong to a parallel group. Recorded times describe their actual overlap.
      </p>
      <div v-for="instance in instances" :key="instance.value" class="recorded-activity">
        <div class="button-row">
          <EntityLink :uri="instance.value" text="Recorded activity" :graph="graph" /><span
            class="small muted"
            >{{
              interval(
                value(graph, instance, NS.prov + 'startedAtTime'),
                value(graph, instance, NS.prov + 'endedAtTime'),
              )
            }}</span
          >
        </div>
        <dl class="compact-facts">
          <dt>Started</dt>
          <dd>{{ dateTime(value(graph, instance, NS.prov + 'startedAtTime')) }}</dd>
          <dt>Ended</dt>
          <dd>{{ dateTime(value(graph, instance, NS.prov + 'endedAtTime')) }}</dd>
          <template v-if="objects(graph, instance, NS.prov + 'wasAssociatedWith').length"
            ><dt>Recorded equipment</dt>
            <dd>
              <EntityLink
                v-for="equipment in objects(graph, instance, NS.prov + 'wasAssociatedWith')"
                :key="equipment.value"
                :uri="equipment.value"
                :graph="graph"
              /></dd
          ></template>
          <template v-if="object(graph, instance, NS.for + 'initialization')"
            ><dt>Initialization plan</dt>
            <dd>
              <EntityLink
                :uri="value(graph, instance, NS.for + 'initialization')"
                :graph="graph"
              /></dd
          ></template>
          <template v-if="object(graph, instance, NS.sosa + 'madeBySensor')"
            ><dt>Sensor</dt>
            <dd>
              <EntityLink :uri="value(graph, instance, NS.sosa + 'madeBySensor')" :graph="graph" />
            </dd>
            <dt>Measured property</dt>
            <dd>
              <EntityLink
                :uri="value(graph, instance, NS.sosa + 'observedProperty')"
                :graph="graph"
              />
            </dd>
            <dt>Observed entity</dt>
            <dd>
              <EntityLink
                :uri="value(graph, instance, NS.sosa + 'hasFeatureOfInterest')"
                :graph="graph"
              /></dd
          ></template>
        </dl>
        <ul v-if="datasets(instance.value).length" class="related-list">
          <li v-for="dataset in datasets(instance.value)" :key="dataset.value">
            <EntityLink
              :uri="dataset.value"
              :text="label(graph, dataset)"
              :graph="graph"
              kind="dataset"
            />
          </li>
        </ul>
      </div>
      <details
        v-if="
          expectation &&
          (!instances.length || !value(graph, instances[0], NS.sosa + 'madeBySensor'))
        "
        class="disclosure small"
      >
        <summary>Planned observation configuration</summary>
        <p class="muted">Demonstrator configuration; execution metadata has not been recorded.</p>
        <p>Sensor: <EntityLink :uri="expectation.sensor" :graph="graph" /></p>
        <p>Property: <EntityLink :uri="expectation.property" :graph="graph" /></p>
        <p v-if="expectation.feature">
          Expected equipment: <EntityLink :uri="expectation.feature" :graph="graph" />
        </p>
        <p v-else>Expected feature: the selected run laminate.</p>
      </details>
      <ActivityTree
        v-for="child in children"
        :key="child.uri"
        :node="child"
        :graph="graph"
        :run="run"
        :depth="depth + 1"
        :selected="selected"
      />
      <details
        v-for="group in groups"
        :key="group.name"
        class="observation-group"
        :open="group.children.some(containsSelected)"
      >
        <summary>
          {{ group.name }} <span class="badge">{{ group.children.length }} activities</span>
        </summary>
        <ActivityTree
          v-for="child in group.children"
          :key="child.uri"
          :node="child"
          :graph="graph"
          :run="run"
          :depth="depth + 1"
          :selected="selected"
        />
      </details>
    </div>
  </details>
</template>

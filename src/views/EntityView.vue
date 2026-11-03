<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { NS, Store, merge, label, value, isType, dateTime, objects } from '../domain/rdf'
import { repository } from '../services/repository'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { datasetsFor } from '../domain/model'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import AllMetadata from '../components/AllMetadata.vue'
import StateBadge from '../components/StateBadge.vue'
const route = useRoute(),
  knowledge = useKnowledgeStore(),
  context = shallowRef(new Store())
const uri = computed(() => String(route.query.uri ?? ''))
let serial = 0
const { loading, error, reload } = useLoad(async () => {
  const current = ++serial
  await knowledge.loadReferences()
  if (!uri.value) {
    context.value = new Store()
    return
  }
  let graph = await repository.getEntityMetadata(uri.value)
  const run = value(graph, uri.value, NS.wild + 'inWorkflowInstance')
  if (run) graph = merge(graph, await repository.getRunContext(run))
  if (current === serial) context.value = graph
}, [() => uri.value, () => knowledge.revision])
const g = computed(() => merge(knowledge.references, context.value))
const run = computed(() => value(g.value, uri.value, NS.wild + 'inWorkflowInstance'))
</script>
<template>
  <RouterLink
    v-if="run"
    :to="{ path: '/run', query: { uri: run, tab: 'process', activity: uri } }"
    class="back-link"
    >← Activity in its production run</RouterLink
  ><RouterLink v-else to="/" class="back-link">← Overview</RouterLink>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!uri || !g.getQuads(null, null, null, null).some((q) => q.subject.value === uri)"
    @retry="reload"
  >
    <template #empty>No information is recorded for this resource.</template>
    <div class="page-heading">
      <p class="eyebrow">
        {{
          isType(g, uri, NS.sosa + 'Observation')
            ? 'Recorded observation'
            : isType(g, uri, NS.sh + 'NodeShape')
              ? 'Declared shape & constraints'
              : 'Related context'
        }}
      </p>
      <h1>{{ label(g, uri) }}</h1>
      <p v-if="value(g, uri, NS.rdfs + 'comment')" class="lede">
        {{ value(g, uri, NS.rdfs + 'comment') }}
      </p>
    </div>
    <section v-if="run || isType(g, uri, NS.sosa + 'Observation')" class="panel">
      <div class="section-heading">
        <h2>Execution context</h2>
        <StateBadge :state="value(g, uri, NS.wild + 'hasState')" />
      </div>
      <dl class="compact-facts">
        <dt>Production run</dt>
        <dd><EntityLink :uri="run" :graph="g" kind="run" /></dd>
        <dt>Model activity</dt>
        <dd><EntityLink :uri="value(g, uri, NS.wild + 'activityInstanceOf')" :graph="g" /></dd>
        <dt>Recorded start</dt>
        <dd>{{ dateTime(value(g, uri, NS.prov + 'startedAtTime')) }}</dd>
        <dt>Recorded end</dt>
        <dd>{{ dateTime(value(g, uri, NS.prov + 'endedAtTime')) }}</dd>
        <dt>Sensor</dt>
        <dd><EntityLink :uri="value(g, uri, NS.sosa + 'madeBySensor')" :graph="g" /></dd>
        <dt>Measured property</dt>
        <dd><EntityLink :uri="value(g, uri, NS.sosa + 'observedProperty')" :graph="g" /></dd>
        <dt>Observed entity</dt>
        <dd><EntityLink :uri="value(g, uri, NS.sosa + 'hasFeatureOfInterest')" :graph="g" /></dd>
        <template v-if="objects(g, uri, NS.for + 'initialization').length"
          ><dt>Initialization plan</dt>
          <dd>
            <EntityLink
              v-for="plan in objects(g, uri, NS.for + 'initialization')"
              :key="plan.value"
              :uri="plan.value"
              :graph="g"
            /></dd
        ></template>
      </dl>
      <h3>Generated datasets</h3>
      <ul class="related-list">
        <li v-for="dataset in datasetsFor(g, uri)" :key="dataset.value">
          <EntityLink :uri="dataset.value" :graph="g" kind="dataset" />
        </li>
      </ul>
      <p v-if="!datasetsFor(g, uri).length" class="muted">No dataset is attached to this record.</p>
    </section>
    <AllMetadata :uri="uri" expanded />
  </AsyncState>
</template>

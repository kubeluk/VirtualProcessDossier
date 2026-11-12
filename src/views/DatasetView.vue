<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { useRoute } from 'vue-router'
import { repository } from '../services/repository'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { NS, Store, merge, objects, value, label, isType, dateTime, interval } from '../domain/rdf'
import { runLaminate } from '../domain/model'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import AllMetadata from '../components/AllMetadata.vue'
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
  const graph = await repository.getDatasetContext(uri.value)
  if (current === serial) context.value = graph
}, [() => uri.value, () => knowledge.revision])
const g = computed(() => merge(knowledge.references, context.value))
const observations = computed(() => objects(g.value, uri.value, NS.prov + 'wasGeneratedBy'))
const distributions = computed(() => objects(g.value, uri.value, NS.dcat + 'distribution'))
function download(url: string) {
  try {
    const u = new URL(url)
    return ['http:', 'https:'].includes(u.protocol) ? u.href : ''
  } catch {
    return ''
  }
}
</script>
<template>
  <RouterLink to="/datasets" class="back-link">← Datasets</RouterLink>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!uri || !isType(context, uri, NS.dcat + 'Dataset')"
    @retry="reload"
  >
    <template #empty>Dataset not found.</template>
    <div class="page-heading">
      <p class="eyebrow">Dataset context</p>
      <h1>{{ label(g, uri) }}</h1>
      <p class="lede">{{ value(g, uri, NS.dct + 'description') || 'Description not recorded.' }}</p>
    </div>
    <section class="panel">
      <p class="eyebrow">Files & access</p>
      <h2>Available distributions</h2>
      <p v-if="!distributions.length" class="muted">No file distributions are recorded.</p>
      <div v-for="(distribution, index) in distributions" :key="index" class="distribution-row">
        <div>
          <h3>{{ value(g, distribution, NS.dcat + 'mediaType') || 'Media type not recorded' }}</h3>
          <p class="small muted">
            Temporal resolution:
            {{ value(g, distribution, NS.dcat + 'temporalResolution') || 'Not recorded' }}
          </p>
          <p class="resource-id">
            {{ value(g, distribution, NS.dcat + 'downloadURL') || 'Download URL not recorded' }}
          </p>
        </div>
        <a
          v-if="download(value(g, distribution, NS.dcat + 'downloadURL'))"
          :href="download(value(g, distribution, NS.dcat + 'downloadURL'))"
          target="_blank"
          rel="noopener noreferrer"
          class="button secondary"
          >Open file ↗</a
        >
      </div>
    </section>
    <section v-if="!observations.length" class="notice">
      The generating observation has not been recorded. Sensor and production context cannot be
      determined.
    </section>
    <section v-for="observation in observations" :key="observation.value" class="panel">
      <p class="eyebrow">Where this data came from</p>
      <h2>Measurement context</h2>
      <p>Generating observation: <EntityLink :uri="observation.value" :graph="g" /></p>
      <div class="context-chain">
        <div>
          <span>01 / Sensor</span
          ><EntityLink :uri="value(g, observation, NS.sosa + 'madeBySensor')" :graph="g" />
        </div>
        <div>
          <span>02 / Measured property</span
          ><EntityLink :uri="value(g, observation, NS.sosa + 'observedProperty')" :graph="g" />
        </div>
        <div>
          <span>03 / Observed entity</span
          ><EntityLink :uri="value(g, observation, NS.sosa + 'hasFeatureOfInterest')" :graph="g" />
        </div>
      </div>
      <dl class="compact-facts">
        <dt>Recorded start</dt>
        <dd>{{ dateTime(value(g, observation, NS.prov + 'startedAtTime')) }}</dd>
        <dt>Recorded end</dt>
        <dd>{{ dateTime(value(g, observation, NS.prov + 'endedAtTime')) }}</dd>
        <dt>Duration</dt>
        <dd>
          {{
            interval(
              value(g, observation, NS.prov + 'startedAtTime'),
              value(g, observation, NS.prov + 'endedAtTime'),
            )
          }}
        </dd>
      </dl>
      <template v-if="value(g, observation, NS.wild + 'inWorkflowInstance')">
        <div class="context-chain">
          <div>
            <span>04 / Production run</span
            ><EntityLink
              :uri="value(g, observation, NS.wild + 'inWorkflowInstance')"
              :graph="g"
              kind="run"
            />
          </div>
          <div>
            <span>05 / Process</span
            ><EntityLink
              :uri="
                value(
                  g,
                  value(g, observation, NS.wild + 'inWorkflowInstance'),
                  NS.wild + 'workflowInstanceOf',
                )
              "
              :graph="g"
            />
          </div>
          <div>
            <span>06 / Input laminate</span
            ><EntityLink
              :uri="runLaminate(g, value(g, observation, NS.wild + 'inWorkflowInstance'))"
              :graph="g"
              kind="laminate"
            />
          </div>
        </div>
        <RouterLink
          :to="{
            path: '/run',
            query: {
              uri: value(g, observation, NS.wild + 'inWorkflowInstance'),
              tab: 'parameters',
            },
          }"
          class="button secondary"
          >Inspect run initialization settings →</RouterLink
        >
      </template>
      <p v-else class="notice">
        Run context not recorded. This catalog record does not establish a connection to a
        production run or its input laminate.
      </p>
    </section>
    <AllMetadata :uri="uri" />
  </AsyncState>
</template>

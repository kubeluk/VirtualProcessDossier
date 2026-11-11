<script setup lang="ts">
import { computed, shallowRef, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { repository } from '../services/repository'
import {
  NS,
  Store,
  merge,
  label,
  value,
  typed,
  isType,
  dateTime,
  interval,
} from '../domain/rdf'
import {
  workflowTree,
  runLaminate,
  runActivities,
  runPlans,
  datasetsFor,
  flatten,
} from '../domain/model'
import { copySettings } from '../domain/initialization'
import { observationExpectations } from '../domain/expectations'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import AllMetadata from '../components/AllMetadata.vue'
import StateBadge from '../components/StateBadge.vue'
import ActivityTree from '../components/ActivityTree.vue'
import MachineParameters from '../components/MachineParameters.vue'
import LaminateSummary from '../components/LaminateSummary.vue'
const route = useRoute(),
  router = useRouter(),
  knowledge = useKnowledgeStore(),
  context = shallowRef(new Store()),
  observationSearch = ref('')
const uri = computed(() => String(route.query.uri ?? ''))
const tab = computed(() =>
  ['overview', 'process', 'parameters', 'observations', 'metadata'].includes(
    String(route.query.tab),
  )
    ? String(route.query.tab)
    : 'overview',
)
let serial = 0
const { loading, error, reload } = useLoad(async () => {
  const current = ++serial
  await knowledge.loadReferences()
  if (!uri.value) {
    context.value = new Store()
    return
  }
  const graph = await repository.getRunContext(uri.value)
  if (current === serial) context.value = graph
}, [() => uri.value, () => knowledge.revision])
const g = computed(() => merge(knowledge.references, context.value))
const model = computed(() => value(g.value, uri.value, NS.wild + 'workflowInstanceOf'))
const tree = computed(() => workflowTree(g.value, model.value))
const laminate = computed(() => runLaminate(g.value, uri.value))
const observations = computed(() =>
  runActivities(g.value, uri.value).filter((t) => isType(g.value, t, NS.sosa + 'Observation')),
)
const filteredObservations = computed(() =>
  observations.value.filter((t) => {
    const fields = [
      label(g.value, value(g.value, t, NS.wild + 'activityInstanceOf')),
      ...[
        NS.sosa + 'madeBySensor',
        NS.sosa + 'observedProperty',
        NS.sosa + 'hasFeatureOfInterest',
      ].map((p) => label(g.value, value(g.value, t, p))),
    ]
    return fields.join(' ').toLowerCase().includes(observationSearch.value.toLowerCase())
  }),
)
const datasets = computed(() => typed(context.value, NS.dcat + 'Dataset'))
const expectedObservations = computed(() =>
  tree.value
    ? flatten(tree.value).filter((node) => observationExpectations.has(node.uri)).length
    : 0,
)
const settings = computed(() => {
  try {
    return { draft: copySettings(g.value, uri.value, knowledge.references, 'read-only'), error: '' }
  } catch (e) {
    return {
      draft: undefined,
      error: e instanceof Error ? e.message : 'Initialization settings are incomplete.',
    }
  }
})
const processSteps = computed(
  () => tree.value?.children.find((c) => c.type === 'sequential')?.children ?? [],
)
function selectTab(next: string) {
  void router.replace({ query: { ...route.query, tab: next } })
}
</script>
<template>
  <RouterLink to="/runs" class="back-link">← Production runs</RouterLink>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!uri || !isType(context, uri, NS.wild + 'WorkflowInstance')"
    @retry="reload"
  >
    <template #empty>Run not found.</template>
    <div class="page-heading heading-with-action">
      <div>
        <div class="button-row">
          <p class="eyebrow">Production run</p>
          <StateBadge :state="value(g, uri, NS.wild + 'hasState')" />
        </div>
        <h1>{{ label(g, uri) }}</h1>
        <p v-if="value(g, uri, NS.rdfs + 'comment')" class="lede">
          {{ value(g, uri, NS.rdfs + 'comment') }}
        </p>
      </div>
      <RouterLink :to="{ path: '/runs/new', query: { copy: uri } }" class="button secondary"
        >Copy settings to a new run</RouterLink
      >
    </div>
    <nav class="section-tabs" aria-label="Run sections">
      <button
        v-for="section in [
          { id: 'overview', name: 'Overview' },
          { id: 'process', name: 'Process' },
          { id: 'parameters', name: 'Parameters' },
          { id: 'observations', name: 'Observations & datasets' },
          { id: 'metadata', name: 'All metadata' },
        ]"
        :key="section.id"
        :aria-current="tab === section.id ? 'page' : undefined"
        :class="{ active: tab === section.id }"
        @click="selectTab(section.id)"
      >
        {{ section.name }}
      </button>
    </nav>
    <template v-if="tab === 'overview'">
      <div class="run-overview-grid">
        <section class="panel">
          <p class="eyebrow">Input & procedure</p>
          <h2>Manufacturing context</h2>
          <dl class="compact-facts">
            <dt>Laminate</dt>
            <dd><EntityLink :uri="laminate" :graph="g" kind="laminate" /></dd>
            <dt>Process</dt>
            <dd><EntityLink :uri="model" :graph="g" kind="process" /></dd>
            <dt>Recorded start</dt>
            <dd>{{ dateTime(value(g, uri, NS.prov + 'startedAtTime')) }}</dd>
            <dt>Recorded end</dt>
            <dd>{{ dateTime(value(g, uri, NS.prov + 'endedAtTime')) }}</dd>
            <dt>Duration</dt>
            <dd>
              {{
                interval(
                  value(g, uri, NS.prov + 'startedAtTime'),
                  value(g, uri, NS.prov + 'endedAtTime'),
                )
              }}
            </dd>
          </dl>
        </section>
        <section class="panel">
          <p class="eyebrow">Recorded measurements</p>
          <div class="measurement-count">
            <strong>{{ datasets.length }}</strong
            ><span>datasets</span>
          </div>
          <p>
            {{ observations.length }} recorded observations · {{ expectedObservations }} planned
            observation activities
          </p>
          <p class="small muted">A recorded observation can have no dataset attached.</p>
          <button class="button secondary" @click="selectTab('observations')">
            Explore observations & datasets →
          </button>
        </section>
      </div>
      <section class="panel">
        <div class="section-heading">
          <h2>Through the process</h2>
          <button class="text-button" @click="selectTab('process')">Inspect activities →</button>
        </div>
        <ol class="process-overview">
          <li v-for="step in processSteps" :key="step.uri">
            <span>{{ step.label }}</span
            ><StateBadge
              :state="
                value(
                  g,
                  runActivities(g, uri).find(
                    (i) => value(g, i, NS.wild + 'activityInstanceOf') === step.uri,
                  ),
                  NS.wild + 'hasState',
                )
              "
            />
          </li>
        </ol>
        <p class="small muted">
          Gripping and its sensor observations form a parallel branch throughout the process.
        </p>
      </section>
      <section class="panel">
        <div class="section-heading">
          <h2>Initialization settings</h2>
          <button class="text-button" @click="selectTab('parameters')">
            View all parameters →
          </button>
        </div>
        <div v-if="settings.draft" class="fact-strip">
          <div>
            <small>Oven threshold</small
            ><strong>{{ settings.draft.oven.threshold }} <span>°C</span></strong>
          </div>
          <div>
            <small>Stable holding time</small
            ><strong>{{ settings.draft.oven.holding }} <span>s</span></strong>
          </div>
          <div>
            <small>Press force</small
            ><strong>{{ settings.draft.press.force }} <span>kN</span></strong>
          </div>
          <div>
            <small>Grippers</small><strong>{{ settings.draft.grippers.length }}</strong>
          </div>
        </div>
        <p v-else class="muted">{{ settings.error }}</p>
        <p class="small muted">
          These are specified settings. Actual measurements are linked through observations.
        </p>
      </section>
      <section v-if="laminate" class="panel">
        <h2>Input laminate</h2>
        <EntityLink :uri="laminate" :graph="g" kind="laminate" /><LaminateSummary :uri="laminate" />
      </section>
    </template>
    <template v-else-if="tab === 'process'"
      ><p class="section-intro">
        Expand a stage to inspect its state, timing, equipment, parameters, and datasets.
      </p>
      <ActivityTree
        v-if="tree"
        :node="tree"
        :graph="g"
        :run="uri"
        :selected="String(route.query.activity ?? route.query.openActivity ?? '')"
      />
      <p v-else class="notice">The process definition is not recorded.</p></template
    >
    <template v-else-if="tab === 'parameters'"
      ><p class="section-intro">
        Initialization settings are preserved as recorded. To reuse them, copy them into a new run.
      </p>
      <MachineParameters v-if="settings.draft" :model-value="settings.draft" readonly />
      <div v-else class="notice">
        {{ settings.error }}
        <div>
          <EntityLink
            v-for="plan in runPlans(g, uri)"
            :key="plan.value"
            :uri="plan.value"
            :graph="g"
          />
        </div></div
    ></template>
    <template v-else-if="tab === 'observations'">
      <div class="section-heading">
        <div>
          <h2>Recorded observations</h2>
          <p class="muted">
            {{ observations.length }} observations · {{ datasets.length }} datasets
          </p>
        </div>
        <RouterLink :to="{ path: '/datasets', query: { run: uri } }"
          >Open datasets in catalog →</RouterLink
        >
      </div>
      <label class="search-field panel"
        ><span class="sr-only">Search observations</span
        ><input
          v-model="observationSearch"
          type="search"
          placeholder="Find a sensor, property, or observed entity…"
      /></label>
      <p v-if="!observations.length" class="notice">
        No observations have been recorded for this run. Planned observation activities are
        available in Process.
      </p>
      <div v-else class="panel table-panel">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Observation</th>
                <th>Sensor</th>
                <th>Property / entity</th>
                <th>Recorded interval</th>
                <th>Datasets</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="obs in filteredObservations" :key="obs.value">
                <td>
                  <EntityLink
                    :uri="obs.value"
                    :text="label(g, value(g, obs, NS.wild + 'activityInstanceOf'))"
                    :graph="g"
                  />
                </td>
                <td><EntityLink :uri="value(g, obs, NS.sosa + 'madeBySensor')" :graph="g" /></td>
                <td>
                  <EntityLink
                    :uri="value(g, obs, NS.sosa + 'observedProperty')"
                    :graph="g"
                  /><br /><EntityLink
                    :uri="value(g, obs, NS.sosa + 'hasFeatureOfInterest')"
                    :graph="g"
                  /><small>{{
                    value(g, obs, NS.sosa + 'hasFeatureOfInterest') === laminate
                      ? 'Direct laminate observation'
                      : 'Equipment observation'
                  }}</small>
                </td>
                <td>
                  {{ dateTime(value(g, obs, NS.prov + 'startedAtTime'))
                  }}<small>{{
                    interval(
                      value(g, obs, NS.prov + 'startedAtTime'),
                      value(g, obs, NS.prov + 'endedAtTime'),
                    )
                  }}</small>
                </td>
                <td>
                  <div v-for="dataset in datasetsFor(g, obs)" :key="dataset.value">
                    <EntityLink :uri="dataset.value" :graph="g" kind="dataset" />
                  </div>
                  <span v-if="!datasetsFor(g, obs).length" class="muted small"
                    >No dataset attached</span
                  >
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-if="observations.length && !filteredObservations.length" class="notice">
        No observations match your search.
      </p>
    </template>
    <AllMetadata v-else :uri="uri" expanded />
  </AsyncState>
</template>

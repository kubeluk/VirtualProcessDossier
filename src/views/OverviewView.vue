<script setup lang="ts">
import { ref } from 'vue'
import { repository } from '../services/repository'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { dateTime, NS, typed, label } from '../domain/rdf'
import type { DatasetSummary, RunSummary } from '../domain/types'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import StateBadge from '../components/StateBadge.vue'
const knowledge = useKnowledgeStore(),
  stats = ref<Record<string, number>>({}),
  runs = ref<RunSummary[]>([]),
  datasets = ref<DatasetSummary[]>([])
const { loading, error, reload } = useLoad(async () => {
  const [counts, recentRuns, recentDatasets] = await Promise.all([
    repository.stats(),
    repository.listRuns({}, 4),
    repository.listDatasets({}, 3),
    knowledge.loadReferences(),
  ])
  stats.value = counts
  runs.value = recentRuns.items
  datasets.value = recentDatasets.items
}, [() => knowledge.revision])
</script>
<template>
  <div class="page-heading heading-with-action">
    <div>
      <p class="eyebrow">A connected view of production</p>
      <h1>Manufacturing, in context.</h1>
      <p class="lede">Prepare the next run. Explore the story behind the last one.</p>
    </div>
    <RouterLink to="/runs/new" class="button primary">＋ Prepare a run</RouterLink>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="reload">
    <div class="stats-grid">
      <RouterLink
        v-for="stat in [
          {
            key: 'runs',
            title: 'Production runs',
            to: '/runs',
            hint: 'Explore recorded executions',
          },
          {
            key: 'initialized',
            title: 'Initialized runs',
            to: '/runs?state=' + NS.wild + 'initialized',
            hint: 'Prepared for the demonstrator',
          },
          {
            key: 'laminates',
            title: 'Laminates',
            to: '/laminates',
            hint: 'Materials and their histories',
          },
          {
            key: 'datasets',
            title: 'Datasets',
            to: '/datasets',
            hint: 'Discover measurement context',
          },
        ]"
        :key="stat.key"
        :to="stat.to"
        class="stat-card"
        ><span class="stat-title">{{ stat.title }} <span>↗</span></span
        ><strong>{{ stats[stat.key] || 0 }}</strong
        ><small>{{ stat.hint }}</small></RouterLink
      >
    </div>
    <div class="dashboard-columns">
      <section class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Production history</p>
            <h2>Recent runs</h2>
          </div>
          <RouterLink to="/runs">View all →</RouterLink>
        </div>
        <div v-if="!runs.length" class="empty-state">
          <h3>Your production context starts here.</h3>
          <p>Initialize a run with a laminate and machine settings.</p>
          <RouterLink to="/runs/new" class="button primary">Prepare your first run</RouterLink>
        </div>
        <article v-for="run in runs" :key="run.uri" class="recent-run">
          <div class="recent-run-marker" />
          <div class="recent-run-body">
            <div class="section-heading">
              <EntityLink :uri="run.uri" :text="run.label" kind="run" /><StateBadge
                :state="run.state"
              />
            </div>
            <p>{{ run.laminateLabel || 'Laminate not recorded' }}</p>
            <small class="muted"
              >{{ run.start ? dateTime(run.start) : 'Execution times not recorded' }} ·
              {{ run.datasetCount }} datasets</small
            >
          </div>
        </article>
      </section>
      <section class="panel accent-panel">
        <p class="eyebrow">The process behind the record</p>
        <h2>Stamp forming</h2>
        <p>
          Follow the laminate through heating, pressing, and inspection, alongside gripping and
          sensor observations.
        </p>
        <div class="process-strip" aria-label="Process overview">
          <span>Load</span><b>→</b><span>Heat</span><b>→</b><span>Press</span><b>→</b
          ><span>Inspect</span>
        </div>
        <div
          v-for="process in typed(knowledge.references, NS.wild + 'WorkflowModel')"
          :key="process.value"
        >
          <EntityLink
            :uri="process.value"
            :text="label(knowledge.references, process)"
            kind="process"
          />
        </div>
        <div class="accent-bottom">
          <span>01</span>
          <p>One process.<br />Many connected perspectives.</p>
        </div>
      </section>
    </div>
    <section class="section-block">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Measurement discovery</p>
          <h2>Explore datasets</h2>
        </div>
        <RouterLink to="/datasets">Browse catalog →</RouterLink>
      </div>
      <div class="card-grid">
        <article v-for="dataset in datasets" :key="dataset.uri" class="panel dataset-card">
          <span class="dataset-icon" aria-hidden="true">▤</span>
          <p class="eyebrow">{{ dataset.media || 'Dataset' }}</p>
          <h3><EntityLink :uri="dataset.uri" :text="dataset.label" kind="dataset" /></h3>
          <p>{{ dataset.description }}</p>
          <div class="card-bottom">
            <span class="small muted">{{
              dataset.run ? 'Linked to a production run' : 'Run context not recorded'
            }}</span
            ><span aria-hidden="true">↗</span>
          </div>
        </article>
      </div>
      <p v-if="!datasets.length" class="notice">No datasets have been recorded yet.</p>
    </section>
    <section class="panel explore-banner">
      <div>
        <p class="eyebrow">Follow the connections</p>
        <h2>Start with what you know.</h2>
        <p>A laminate, a sensor, or a file can lead you to the context around a production run.</p>
      </div>
      <div class="button-row">
        <RouterLink to="/laminates" class="button secondary">Explore laminates</RouterLink
        ><RouterLink to="/equipment" class="button secondary">Explore equipment</RouterLink>
      </div>
    </section>
    <p v-if="!typed(knowledge.references, NS.wild + 'WorkflowModel').length" class="notice">
      No process definitions found. Load the example data to prepare runs.
    </p>
  </AsyncState>
</template>

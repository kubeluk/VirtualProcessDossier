<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { NS, value, label, isType } from '../domain/rdf'
import { workflowTree, flatten } from '../domain/model'
import { repository } from '../services/repository'
import type { RunSummary } from '../domain/types'
import AsyncState from '../components/AsyncState.vue'
import ActivityTree from '../components/ActivityTree.vue'
import EntityLink from '../components/EntityLink.vue'
import AllMetadata from '../components/AllMetadata.vue'
import StateBadge from '../components/StateBadge.vue'
const route = useRoute(),
  knowledge = useKnowledgeStore(),
  runs = ref<RunSummary[]>([]),
  total = ref(0)
const uri = computed(() => String(route.query.uri ?? ''))
const tree = computed(() => workflowTree(knowledge.references, uri.value))
const { loading, error, reload } = useLoad(async () => {
  await knowledge.loadReferences()
  if (uri.value) {
    const result = await repository.listRuns({ model: uri.value }, 5)
    runs.value = result.items
    total.value = result.total
  }
}, [() => uri.value, () => knowledge.revision])
</script>
<template>
  <RouterLink to="/" class="back-link">← Overview</RouterLink>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!uri || !isType(knowledge.references, uri, NS.wild + 'WorkflowModel')"
    @retry="reload"
  >
    <template #empty>Process definition not found.</template>
    <div class="page-heading heading-with-action">
      <div>
        <p class="eyebrow">Process definition</p>
        <h1>{{ label(knowledge.references, uri) }}</h1>
        <p class="lede">{{ value(knowledge.references, uri, NS.rdfs + 'comment') }}</p>
      </div>
      <RouterLink to="/runs/new" class="button primary">Prepare run</RouterLink>
    </div>
    <section class="panel">
      <h2>Process structure</h2>
      <p v-if="tree" class="muted">
        {{ flatten(tree).filter((t) => t.type === 'atomic').length }} atomic activities in
        sequential and parallel groups.
      </p>
      <p class="small muted">
        Sequence follows the recorded list order. Parallel groups express membership, not exact
        timing.
      </p>
      <ActivityTree v-if="tree" :node="tree" :graph="knowledge.references" />
    </section>
    <section class="panel">
      <div class="section-heading">
        <h2>Related runs</h2>
        <RouterLink :to="{ path: '/runs', query: { model: uri } }"
          >View all {{ total }} →</RouterLink
        >
      </div>
      <div v-for="run in runs" :key="run.uri" class="related-row">
        <EntityLink :uri="run.uri" :text="run.label" kind="run" /><StateBadge :state="run.state" />
      </div>
      <p v-if="!runs.length" class="muted">No runs recorded.</p>
    </section>
    <AllMetadata :uri="uri" />
  </AsyncState>
</template>

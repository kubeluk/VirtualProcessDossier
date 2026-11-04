<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { repository } from '../services/repository'
import { NS, value, label, isType, dateTime } from '../domain/rdf'
import type { RunSummary } from '../domain/types'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import LaminateSummary from '../components/LaminateSummary.vue'
import AllMetadata from '../components/AllMetadata.vue'
import StateBadge from '../components/StateBadge.vue'
const router = useRouter()
const deleting = ref(false),
  confirmDelete = ref(false),
  deleteError = ref('')
async function remove() {
  if (deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await repository.deleteLaminate(uri.value)
    await knowledge.refresh()
    await router.push('/laminates')
  } catch (e) {
    deleteError.value = e instanceof Error ? e.message : 'Could not delete the laminate.'
  } finally {
    deleting.value = false
  }
}
const route = useRoute(),
  knowledge = useKnowledgeStore(),
  runs = ref<RunSummary[]>([]),
  total = ref(0)
const uri = computed(() => String(route.query.uri ?? ''))
const { loading, error, reload } = useLoad(async () => {
  await knowledge.loadReferences()
  if (!uri.value) return
  const result = await repository.listRuns({ laminate: uri.value }, 5)
  runs.value = result.items
  total.value = result.total
}, [() => uri.value, () => knowledge.revision])
</script>
<template>
  <RouterLink to="/laminates" class="back-link">← Laminates</RouterLink>
  <AsyncState
    :loading="loading"
    :error="error"
    :empty="!uri || !isType(knowledge.references, uri, NS.for + 'Laminate')"
    @retry="reload"
  >
    <template #empty>Laminate not found.</template>
    <div class="page-heading heading-with-action">
      <div>
        <p class="eyebrow">
          Laminate ·
          {{ value(knowledge.references, uri, NS.dct + 'identifier') || 'Identifier not recorded' }}
        </p>
        <h1>{{ label(knowledge.references, uri) }}</h1>
        <p class="lede">Material, geometry, and manufacturing history.</p>
      </div>
      <RouterLink
        v-if="!total"
        :to="{ path: '/runs/new', query: { laminate: uri } }"
        class="button primary"
        >Prepare run with this laminate</RouterLink
      >
      <p v-else class="notice small">Already assigned to a run · unavailable for a new run.</p>
    </div>
    <div class="wizard-actions">
      <RouterLink :to="{ path: '/laminates/new', query: { copy: uri } }" class="button secondary"
        >Create from copy</RouterLink
      >
      <RouterLink :to="{ path: '/laminate/edit', query: { uri } }" class="button secondary"
        >Edit laminate</RouterLink
      >
      <button class="text-button" :disabled="deleting" @click="confirmDelete = true">
        Delete laminate
      </button>
    </div>
    <section v-if="confirmDelete" class="panel" aria-label="Confirm deletion">
      <h2>Delete this laminate?</h2>
      <p>
        This removes the laminate and its unshared material and geometry records. Laminates
        referenced by other records cannot be deleted.
      </p>
      <button class="button secondary" :disabled="deleting" @click="confirmDelete = false">
        Cancel
      </button>
      <button class="button primary" :disabled="deleting" @click="remove">
        {{ deleting ? 'Deleting…' : 'Confirm delete' }}
      </button>
    </section>
    <p v-if="deleteError" class="notice error" role="alert">{{ deleteError }}</p>
    <section class="panel"><LaminateSummary :uri="uri" expanded /></section>
    <section class="panel">
      <div class="section-heading">
        <h2>Associated production runs</h2>
        <RouterLink :to="{ path: '/runs', query: { laminate: uri } }"
          >View all {{ total }} →</RouterLink
        >
      </div>
      <div v-for="run in runs" :key="run.uri" class="related-row">
        <EntityLink :uri="run.uri" :text="run.label" kind="run" /><StateBadge
          :state="run.state"
        /><span class="muted small">{{ dateTime(run.start) }}</span>
      </div>
      <p v-if="!runs.length" class="muted">No production runs are associated with this laminate.</p>
    </section>
    <AllMetadata :uri="uri" />
  </AsyncState>
</template>

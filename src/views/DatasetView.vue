<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore, type DatasetDetail, type WorkflowContext } from '@/stores/catalog'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()

const dataset = ref<DatasetDetail | null>(null)
const workflowContext = ref<WorkflowContext | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  const uri = route.query.uri as string
  if (!uri) {
    router.replace({ name: 'catalog' })
    return
  }
  try {
    ;[dataset.value, workflowContext.value] = await Promise.all([
      catalog.fetchDataset(uri),
      catalog.fetchDatasetWorkflowContext(uri),
    ])
    if (!dataset.value) error.value = 'Dataset not found.'
  } catch {
    error.value = 'Failed to load dataset.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="dataset-view">
    <button class="back-link" @click="router.push({ name: 'catalog' })">← Back to catalog</button>

    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="dataset">
      <h1 class="dataset-title">{{ dataset.title }}</h1>

      <p v-if="dataset.description" class="dataset-description">{{ dataset.description }}</p>

      <section v-if="workflowContext" class="workflow-context-section">
        <h2>Workflow Context</h2>
        <div class="wc-workflow-row">
          <span class="wc-workflow-label">Part of run</span>
          <button
            class="wc-workflow-link"
            @click="router.push({ name: 'run', query: { uri: workflowContext.runUri } })"
          >
            {{ workflowContext.runLabel ?? workflowContext.runUri }} →
          </button>
        </div>
        <div v-if="workflowContext.workflowUri" class="wc-workflow-row">
          <span class="wc-workflow-label">Workflow</span>
          <button
            class="wc-workflow-link"
            @click="router.push({ name: 'workflow', query: { uri: workflowContext.workflowUri! } })"
          >
            {{ workflowContext.workflowLabel ?? workflowContext.workflowUri }}
          </button>
        </div>
      </section>

      <section v-if="dataset.distributions.length > 0" class="distributions-section">
        <h2>Distributions</h2>
        <ul class="distribution-list">
          <li v-for="(dist, i) in dataset.distributions" :key="i" class="distribution-item">
            <dl class="dist-details">
              <template v-if="dist.mediaType">
                <dt>Media type</dt>
                <dd>{{ dist.mediaType }}</dd>
              </template>
              <template v-if="dist.temporalResolution">
                <dt>Temporal resolution</dt>
                <dd>{{ dist.temporalResolution }}</dd>
              </template>
              <template v-if="dist.downloadURL">
                <dt>Download</dt>
                <dd>
                  <a
                    :href="dist.downloadURL"
                    class="download-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ dist.downloadURL }}</a>
                </dd>
              </template>
            </dl>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.dataset-view {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.back-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.9rem;
  color: var(--color-primary);
  cursor: pointer;
  margin-bottom: 1.5rem;
  display: inline-block;
}

.back-link:hover {
  color: var(--color-primary-dark);
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error {
  color: #dc2626;
}

.dataset-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.75rem;
}

.dataset-description {
  font-size: 1rem;
  color: #4b5563;
  line-height: 1.6;
  margin: 0 0 2rem;
}

section {
  margin-bottom: 2rem;
}

section h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-border);
}

.metadata-grid {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
}

.metadata-grid dt {
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
}

.metadata-grid dd {
  font-size: 0.875rem;
  color: var(--color-text);
  margin: 0;
}

.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.keyword-tag {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
  color: #374151;
}

.distribution-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.distribution-item {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.875rem 1.25rem;
}

.dist-details {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
}

.dist-details dt {
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
}

.dist-details dd {
  font-size: 0.875rem;
  color: var(--color-text);
  margin: 0;
  font-family: monospace;
  word-break: break-all;
}

.download-link {
  color: var(--color-primary);
  text-decoration: none;
  font-family: monospace;
  font-size: 0.8rem;
  word-break: break-all;
}

.download-link:hover {
  text-decoration: underline;
}

/* Workflow context section */
.wc-note {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0 0 0.75rem;
}

.wc-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.25rem;
}

.wc-step-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.35rem;
}

.wc-step-desc {
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.55;
  margin: 0 0 0.75rem;
}

.wc-parent-step {
  font-size: 0.875rem;
  color: #4b5563;
  margin: 0 0 0.5rem;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.wc-workflow-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.wc-workflow-label {
  font-size: 0.8rem;
  color: #6b7280;
  flex-shrink: 0;
}

.wc-workflow-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
  font-family: inherit;
}

.wc-workflow-link:hover {
  color: var(--color-primary-dark);
}

/* Provenance section */
.prov-header {
  margin-bottom: 1rem;
}

.prov-obs-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.35rem;
}

.prov-timerange {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 0;
}

.prov-meta-label {
  font-weight: 500;
  margin-right: 0.25rem;
}

.prov-grid {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 0.75rem 1rem;
  margin: 0;
}

.prov-grid dt {
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  padding-top: 0.1rem;
}

.prov-grid dd {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.entity-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text);
}

.entity-desc {
  font-size: 0.8rem;
  color: #6b7280;
  line-height: 1.45;
}
</style>

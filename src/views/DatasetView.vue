<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore, type DatasetDetail, type WorkflowContext } from '@/stores/catalog'

function localPartName(uri: string): string {
  return uri.split(/[/#]/).pop() ?? uri
}

function partLabel(uri: string): string {
  return `Part ${localPartName(uri)}`
}

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
        <h2>Provenance</h2>
        <template v-if="workflowContext.runUri">
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
        </template>
        <template v-if="workflowContext.partUri">
          <div class="wc-workflow-row">
            <span class="wc-workflow-label">Derived from part</span>
            <button
              class="wc-workflow-link"
              @click="router.push({ name: 'parts', query: { part: workflowContext.partUri } })"
            >
              {{ partLabel(workflowContext.partUri) }} →
            </button>
          </div>
          <div class="wc-workflow-row">
            <span class="wc-workflow-label">Part dossier</span>
            <button
              class="wc-workflow-link"
              @click="router.push({ name: 'dossier', query: { part: workflowContext.partUri } })"
            >
              Open dossier →
            </button>
          </div>
        </template>
      </section>

      <section v-if="dataset.distributions.length > 0" class="distributions-section">
        <h2>Distributions</h2>
        <ul class="distribution-list">
          <li v-for="(dist, i) in dataset.distributions" :key="i" class="distribution-item">
            <div class="dist-meta">
              <span v-if="dist.mediaType" class="dist-badge">{{ dist.mediaType }}</span>
              <span v-if="dist.temporalResolution" class="dist-badge dist-badge--secondary">
                Δt {{ dist.temporalResolution }}
              </span>
            </div>
            <a
              v-if="dist.downloadURL"
              :href="dist.downloadURL"
              class="download-btn"
              target="_blank"
              rel="noopener noreferrer"
            >↓ Download</a>
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
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem 1rem;
}

.dist-meta {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  flex: 1;
}

.dist-badge {
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
  background: #f3f4f6;
  color: #374151;
}

.dist-badge--secondary {
  background: #eff6ff;
  color: #1d4ed8;
}

.download-btn {
  flex-shrink: 0;
  display: inline-block;
  padding: 0.4rem 0.9rem;
  border-radius: 6px;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.download-btn:hover {
  background: var(--color-primary-dark);
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

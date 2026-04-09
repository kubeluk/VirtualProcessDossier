<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCatalogStore, type DatasetDetail } from '@/stores/catalog'

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()

const dataset = ref<DatasetDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  const uri = route.query.uri as string
  if (!uri) {
    router.replace({ name: 'catalog' })
    return
  }
  try {
    dataset.value = await catalog.fetchDataset(uri)
    if (!dataset.value) error.value = 'Dataset not found.'
  } catch {
    error.value = 'Failed to load dataset.'
  } finally {
    loading.value = false
  }
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

function formatMediaType(uri: string): string {
  // Extract e.g. "text/csv" from IANA URI or return as-is
  const match = uri.match(/media-types\/(.+)$/)
  return match ? match[1] : uri
}
</script>

<template>
  <main class="dataset-view">
    <button class="back-link" @click="router.push({ name: 'catalog' })">← Back to catalog</button>

    <div v-if="loading" class="state-message">Loading…</div>

    <div v-else-if="error" class="state-message error">{{ error }}</div>

    <template v-else-if="dataset">
      <h1 class="dataset-title">{{ dataset.title }}</h1>

      <p v-if="dataset.description" class="dataset-description">{{ dataset.description }}</p>

      <section class="metadata-section">
        <h2>Details</h2>
        <dl class="metadata-grid">
          <template v-if="dataset.modified">
            <dt>Last updated</dt>
            <dd>{{ formatDate(dataset.modified) }}</dd>
          </template>
          <template v-if="dataset.keywords.length > 0">
            <dt>Keywords</dt>
            <dd class="keywords">
              <span v-for="kw in dataset.keywords" :key="kw" class="keyword-tag">{{ kw }}</span>
            </dd>
          </template>
        </dl>
      </section>

      <section v-if="dataset.distributions.length > 0" class="distributions-section">
        <h2>Downloads</h2>
        <ul class="distribution-list">
          <li v-for="dist in dataset.distributions" :key="dist.uri" class="distribution-item">
            <div class="dist-info">
              <span v-if="dist.title" class="dist-title">{{ dist.title }}</span>
              <div class="dist-meta">
                <span v-if="dist.mediaType" class="dist-format">
                  {{ formatMediaType(dist.mediaType) }}
                </span>
                <span v-if="dist.byteSize" class="dist-size">
                  {{ formatBytes(dist.byteSize) }}
                </span>
              </div>
            </div>
            <a
              v-if="dist.downloadURL"
              :href="dist.downloadURL"
              class="download-btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download
            </a>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.dist-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dist-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text);
}

.dist-meta {
  display: flex;
  gap: 0.75rem;
}

.dist-format {
  font-size: 0.8rem;
  color: #6b7280;
  font-family: monospace;
}

.dist-size {
  font-size: 0.8rem;
  color: #6b7280;
}

.download-btn {
  flex-shrink: 0;
  background: var(--color-primary);
  color: #fff;
  border-radius: 5px;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.15s;
}

.download-btn:hover {
  background: var(--color-primary-dark);
}
</style>

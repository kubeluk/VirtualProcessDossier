<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogStore } from '@/stores/catalog'

const router = useRouter()
const catalog = useCatalogStore()

onMounted(() => catalog.fetchDatasets())

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

function openDataset(uri: string) {
  router.push({ name: 'dataset', query: { uri } })
}
</script>

<template>
  <main class="catalog">
    <header class="catalog-header">
      <h1>Data Catalog</h1>
      <p class="subtitle">Browse datasets available in the VPD knowledge graph.</p>
    </header>

    <div v-if="catalog.loading" class="state-message">Loading datasets…</div>

    <div v-else-if="catalog.error" class="state-message error">{{ catalog.error }}</div>

    <div v-else-if="catalog.datasets.length === 0" class="state-message">
      No datasets found in the catalog.
    </div>

    <ul v-else class="dataset-list">
      <li
        v-for="ds in catalog.datasets"
        :key="ds.uri"
        class="dataset-card"
        @click="openDataset(ds.uri)"
      >
        <div class="card-body">
          <h2 class="card-title">{{ ds.title }}</h2>
          <p v-if="ds.description" class="card-description">{{ ds.description }}</p>
        </div>
        <div class="card-meta">
          <span v-if="ds.modified" class="meta-item">
            Updated {{ formatDate(ds.modified) }}
          </span>
          <span class="meta-item">
            {{ ds.distributionCount }}
            {{ ds.distributionCount === 1 ? 'distribution' : 'distributions' }}
          </span>
        </div>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.catalog-header {
  margin-bottom: 2rem;
}

.catalog-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.subtitle {
  color: #6b7280;
  margin: 0;
}

.state-message {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
}

.state-message.error {
  color: #dc2626;
}

.dataset-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dataset-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: var(--color-background);
}

.dataset-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(66, 184, 131, 0.15);
}

.card-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 0.4rem;
}

.card-description {
  font-size: 0.9rem;
  color: #4b5563;
  margin: 0 0 0.75rem;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.meta-item {
  font-size: 0.8rem;
  color: #6b7280;
}
</style>

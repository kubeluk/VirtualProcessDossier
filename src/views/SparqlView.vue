<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Yasgui from '@triply/yasgui'
import '@triply/yasgui/build/yasgui.min.css'

const container = ref<HTMLElement | null>(null)

const VPD_PREFIXES: Record<string, string> = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  dcat: 'http://www.w3.org/ns/dcat#',
  dcterms: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
  sosa: 'http://www.w3.org/ns/sosa/',
  ssn: 'http://www.w3.org/ns/ssn/',
  wild: 'http://purl.org/wild/vocab#',
  qudt: 'http://qudt.org/schema/qudt/',
  vpd: 'http://purl.org/vpd/data#',
  workflow: 'http://purl.org/for/workflow#',
  activity: 'http://purl.org/for/activity#',
  run: 'http://purl.org/for/run#',
  machine: 'http://purl.org/for/machine#',
  plan: 'http://purl.org/for/plan#',
  param: 'http://purl.org/for/param#',
}

onMounted(() => {
  if (!container.value) return
  const yasgui = new Yasgui(container.value, {
    requestConfig: { endpoint: '/sparql', method: 'POST' },
    copyEndpointOnNewTab: true,
  })
  const tab = yasgui.getTab()
  if (tab) tab.getYasqe().addPrefixes(VPD_PREFIXES)
})
</script>

<template>
  <main class="sparql-view">
    <header class="sparql-header">
      <RouterLink to="/" class="back-btn">← Dossier</RouterLink>
      <div class="sparql-title-group">
        <span class="sparql-title">SPARQL Query</span>
        <span class="sparql-subtitle">Endpoint: <code>/sparql</code> (vpd dataset)</span>
      </div>
    </header>

    <div ref="container" class="yasgui-container"></div>
  </main>
</template>

<style scoped>
.sparql-view {
  min-height: 100vh;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
}

.sparql-header {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  padding: 0.75rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: #374151;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 5px;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s, border-color 0.15s;
}

.back-btn:hover {
  background: #e5e7eb;
  border-color: #d1d5db;
}

.sparql-title-group {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.sparql-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
}

.sparql-subtitle {
  font-size: 0.8rem;
  color: #9ca3af;
}

.sparql-subtitle code {
  font-family: monospace;
  background: #f3f4f6;
  padding: 0.1em 0.35em;
  border-radius: 3px;
}

.yasgui-container {
  flex: 1;
  padding: 1.5rem 2rem;
}

.yasgui-container :deep(.yasgui) {
  width: 100%;
}
</style>

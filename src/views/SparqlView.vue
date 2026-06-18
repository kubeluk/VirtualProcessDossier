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
    <header class="page-header">
      <div>
        <h1>SPARQL Query</h1>
        <p class="subtitle">Query the knowledge graph directly. Endpoint: <code>/sparql</code> (vpd dataset)</p>
      </div>
    </header>

    <nav class="page-nav">
      <RouterLink to="/" class="nav-tab">Dossier</RouterLink>
      <RouterLink to="/catalog" class="nav-tab">Datasets</RouterLink>
      <span class="nav-divider" aria-hidden="true"></span>
      <RouterLink to="/workflows" class="nav-tab nav-tab--secondary">Workflows</RouterLink>
      <RouterLink to="/systems" class="nav-tab nav-tab--secondary">Systems</RouterLink>
      <RouterLink to="/parts" class="nav-tab nav-tab--secondary">Parts</RouterLink>
      <RouterLink to="/sparql" class="nav-tab nav-tab--secondary nav-tab--active">SPARQL</RouterLink>
    </nav>

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

.page-header {
  padding: 2rem 2rem 1rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.page-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
}

.subtitle {
  margin-top: 0.25rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.subtitle code {
  background: #f3f4f6;
  padding: 0.1em 0.4em;
  border-radius: 3px;
  font-size: 0.85em;
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 2rem;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.nav-tab {
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: #6b7280;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.nav-tab:hover { color: #111827; }

.nav-tab--active {
  color: #111827;
  border-bottom-color: #111827;
}

.nav-divider {
  width: 1px;
  height: 1.25rem;
  background: #e5e7eb;
  margin: 0 0.5rem;
}

.nav-tab--secondary { font-size: 0.82rem; color: #9ca3af; }
.nav-tab--secondary:hover { color: #111827; }
.nav-tab--secondary.nav-tab--active {
  color: #111827;
  border-bottom-color: #111827;
}

.yasgui-container {
  flex: 1;
  padding: 1.5rem 2rem;
}

/* Let YASGUI fill the container width */
.yasgui-container :deep(.yasgui) {
  width: 100%;
}
</style>

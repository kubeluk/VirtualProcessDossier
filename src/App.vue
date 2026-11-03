<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useKnowledgeStore } from './stores/knowledge'
const route = useRoute(),
  knowledge = useKnowledgeStore(),
  connectionError = ref(''),
  refreshing = ref(false)
async function refresh() {
  refreshing.value = true
  connectionError.value = ''
  try {
    await knowledge.refresh()
  } catch (error) {
    connectionError.value = error instanceof Error ? error.message : 'Connection unavailable.'
  } finally {
    refreshing.value = false
  }
}
onMounted(async () => {
  try {
    await knowledge.loadReferences()
  } catch (error) {
    connectionError.value = String(error)
  }
})
watch(
  () => knowledge.loaded,
  (loaded) => {
    if (loaded) connectionError.value = ''
  },
)
const navigation = [
  { to: '/', label: 'Overview', icon: '◫' },
  { to: '/runs', label: 'Production runs', icon: '↗' },
  { to: '/laminates', label: 'Laminates', icon: '▱' },
  { to: '/datasets', label: 'Datasets', icon: '▤' },
  { to: '/equipment', label: 'Equipment', icon: '⊞' },
]
</script>
<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="app-shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">V<span>·</span>P<span>·</span>D</span
        ><span class="brand-name">Virtual Process<br />Dossier</span></RouterLink
      >
      <p class="nav-caption">MANUFACTURING CONTEXT</p>
      <nav aria-label="Main navigation">
        <RouterLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          :class="{
            active:
              item.to === '/'
                ? route.path === '/'
                : route.path.startsWith(item.to) ||
                  (item.to === '/runs' && route.path === '/run') ||
                  (item.to === '/datasets' && route.path === '/dataset') ||
                  (item.to === '/laminates' && route.path === '/laminate'),
          }"
          ><span aria-hidden="true">{{ item.icon }}</span
          >{{ item.label }}</RouterLink
        >
      </nav>
      <RouterLink to="/runs/new" class="button primary prepare-link"
        ><span aria-hidden="true">＋</span> Prepare run</RouterLink
      >
      <div class="sidebar-bottom">
        <span class="status-dot" :class="{ offline: connectionError }" /><span>{{
          connectionError
            ? 'Connection unavailable'
            : knowledge.loaded
              ? 'Knowledge graph connected'
              : 'Connecting to knowledge graph'
        }}</span>
        <p>From material to manufacturing context.</p>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span>VPD <span class="topbar-separator">/</span> {{ route.meta.title }}</span
        ><button class="refresh-button" :disabled="refreshing" @click="refresh">
          {{ refreshing ? 'Refreshing…' : '↻ Refresh context' }}
        </button>
      </header>
      <main id="main" class="main-content" tabindex="-1">
        <p v-if="connectionError" class="notice error" role="alert">{{ connectionError }}</p>
        <RouterView />
      </main>
      <footer class="app-footer">
        <span>Virtual Process Dossier</span><span>Recorded context. Connected knowledge.</span>
      </footer>
    </div>
  </div>
</template>

import { ref, watch, onMounted, onScopeDispose } from 'vue'
import type { WatchSource } from 'vue'

export function useLoad(load: () => Promise<void>, sources: WatchSource[] = []) {
  const loading = ref(true),
    error = ref('')
  let generation = 0,
    disposed = false
  async function reload() {
    const current = ++generation
    loading.value = true
    error.value = ''
    try {
      await load()
    } catch (e) {
      if (!disposed && current === generation)
        error.value = e instanceof Error ? e.message : 'Could not load this record.'
    } finally {
      if (!disposed && current === generation) loading.value = false
    }
  }
  if (sources.length) watch(sources, reload)
  onMounted(reload)
  onScopeDispose(() => {
    disposed = true
    generation++
  })
  return { loading, error, reload }
}

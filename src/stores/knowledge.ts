import { defineStore } from 'pinia'
import { shallowRef, ref } from 'vue'
import { Store } from '../domain/rdf'
import { repository } from '../services/repository'

export const useKnowledgeStore = defineStore('knowledge', () => {
  const references = shallowRef(new Store())
  const loaded = ref(false)
  const revision = ref(0)
  let pending: Promise<void> | undefined
  async function loadReferences(force = false) {
    if (pending) return pending
    if (loaded.value && !force) return
    pending = repository
      .getReferenceGraph()
      .then((graph) => {
        references.value = graph
        loaded.value = true
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }
  async function refresh() {
    await loadReferences(true)
    revision.value++
  }
  return { references, loaded, revision, loadReferences, refresh }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGraphStore = defineStore('graph', () => {
  const endpoint = ref(import.meta.env.VITE_SPARQL_ENDPOINT ?? '/sparql')

  return { endpoint }
})

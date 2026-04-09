import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useGraphStore = defineStore('graph', () => {
  const endpoint = ref(import.meta.env.VITE_SPARQL_ENDPOINT ?? '/sparql')
  const updateEndpoint = ref(import.meta.env.VITE_SPARQL_UPDATE_ENDPOINT ?? '/update')

  return { endpoint, updateEndpoint }
})

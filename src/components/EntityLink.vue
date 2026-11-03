<script setup lang="ts">
import { computed } from 'vue'
import { useKnowledgeStore } from '../stores/knowledge'
import { label } from '../domain/rdf'
import type { Store } from '../domain/rdf'
import { entityRoute } from '../domain/navigation'
const props = defineProps<{ uri?: string; text?: string; graph?: Store; kind?: string }>()
const knowledge = useKnowledgeStore()
const graph = computed(() => props.graph ?? knowledge.references)
</script>
<template>
  <RouterLink v-if="uri" :to="entityRoute(uri, graph, kind)" :title="uri"
    >{{ text || label(graph, uri)
    }}<span class="link-arrow" aria-hidden="true"> ↗</span></RouterLink
  >
  <span v-else class="muted">Not recorded</span>
</template>

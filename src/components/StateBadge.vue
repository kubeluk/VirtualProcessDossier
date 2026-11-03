<script setup lang="ts">
import { describeState } from '../domain/model'
import { NS } from '../domain/rdf'
defineProps<{ state?: string }>()
</script>
<template>
  <span
    class="badge"
    :class="{ done: state === NS.wild + 'done', ready: state === NS.wild + 'initialized' }"
    >{{ describeState(state || '') }}</span
  >
</template>

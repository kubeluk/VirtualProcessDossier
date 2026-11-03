<script setup lang="ts">
defineProps<{ loading: boolean; error: string; empty?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div v-if="loading" class="notice" role="status"><span class="spinner" /> Loading context…</div>
  <div v-else-if="error" class="notice error" role="alert">
    <p>{{ error }}</p>
    <button class="button secondary" @click="$emit('retry')">Try again</button>
  </div>
  <div v-else-if="empty" class="notice"><slot name="empty">No records found.</slot></div>
  <slot v-else />
</template>

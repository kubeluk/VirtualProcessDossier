<script setup lang="ts">
import { RouterView } from 'vue-router'
import BackToTop from '@/components/BackToTop.vue'
</script>

<template>
  <RouterView />
  <BackToTop />
</template>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const visible = ref(false)

function updateVisibility() {
  visible.value = window.scrollY > 240
}

function backToTop() {
  // Keep keyboard navigation at the top when the button disappears.
  document.querySelector<HTMLAnchorElement>('nav a[href]')?.focus({ preventScroll: true })
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  })
}

onMounted(() => {
  updateVisibility()
  window.addEventListener('scroll', updateVisibility, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateVisibility)
})
</script>

<template>
  <button v-if="visible" type="button" class="back-to-top" @click="backToTop">
    <span aria-hidden="true">↑</span>
    Back to top
  </button>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right));
  bottom: max(1rem, env(safe-area-inset-bottom));
  z-index: 50;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 44px;
  padding: 0.65rem 1rem;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--color-primary);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.back-to-top:hover {
  background: var(--color-primary-dark);
}

.back-to-top:focus-visible {
  outline: 3px solid var(--color-text);
  outline-offset: 3px;
}
</style>

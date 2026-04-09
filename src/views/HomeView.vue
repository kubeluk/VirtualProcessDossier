<script setup lang="ts">
</script>

<template>
  <main class="home">
    <h1>VPD Knowledge Graph</h1>
    <p class="lead">Explore and manage datasets in the VPD data catalog.</p>
    <RouterLink to="/catalog" class="cta-btn">Browse datasets</RouterLink>
  </main>
</template>

<style scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}

.home h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.75rem;
}

.lead {
  font-size: 1.1rem;
  color: #4b5563;
  margin: 0 0 2rem;
}

.cta-btn {
  display: inline-block;
  background: var(--color-primary);
  color: #fff;
  padding: 0.65rem 1.5rem;
  border-radius: 6px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.15s;
}

.cta-btn:hover {
  background: var(--color-primary-dark);
}
</style>

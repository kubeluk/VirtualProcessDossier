<script setup lang="ts">
</script>

<template>
  <main class="home">
    <h1>VPD Knowledge Graph</h1>
    <p class="lead">Explore datasets and manufacturing workflows in the VPD data catalog.</p>
    <div class="cta-row">
      <RouterLink to="/catalog" class="cta-btn">Browse datasets</RouterLink>
      <RouterLink to="/workflows" class="cta-btn cta-btn--secondary">Explore workflows</RouterLink>
    </div>
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

.cta-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
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

.cta-btn--secondary {
  background: #fff;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.cta-btn--secondary:hover {
  background: #f0fdf4;
}
</style>

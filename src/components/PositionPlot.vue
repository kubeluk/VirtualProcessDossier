<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{
  points: { name: string; x: string; y: string }[]
  title: string
  reference?: string
}>()
const points = computed(() =>
  props.points.filter(
    (p) => p.x !== '' && p.y !== '' && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)),
  ),
)
const bounds = computed(() => {
  const xs = points.value.map((p) => Number(p.x)),
    ys = points.value.map((p) => Number(p.y))
  return {
    minX: Math.min(0, ...xs),
    maxX: Math.max(1, ...xs),
    minY: Math.min(0, ...ys),
    maxY: Math.max(1, ...ys),
  }
})
const x = (v: string | number) =>
  45 + ((Number(v) - bounds.value.minX) / (bounds.value.maxX - bounds.value.minX)) * 290
const y = (v: string | number) =>
  225 - ((Number(v) - bounds.value.minY) / (bounds.value.maxY - bounds.value.minY)) * 190
</script>
<template>
  <figure class="position-plot">
    <svg viewBox="0 0 380 270" role="img" :aria-label="title">
      <title>{{ title }}</title>
      <line :x1="x(0)" y1="20" :x2="x(0)" y2="240" class="plot-axis" />
      <line x1="25" :y1="y(0)" x2="350" :y2="y(0)" class="plot-axis" />
      <text x="345" :y="y(0) - 8">X</text>
      <text :x="x(0) + 8" y="20">Y</text>
      <g v-for="(point, index) in points" :key="point.name">
        <circle :cx="x(point.x)" :cy="y(point.y)" r="7" class="plot-point">
          <title>{{ point.name }}: {{ point.x }}, {{ point.y }} mm</title>
        </circle>
        <text :x="x(point.x) + 10" :y="y(point.y) - 9">{{ index + 1 }}</text>
      </g>
      <text v-if="!points.length" x="75" y="130">Enter coordinates to see positions</text>
    </svg>
    <figcaption>
      {{ title }} · mm <span v-if="reference">· {{ reference }}</span>
    </figcaption>
  </figure>
</template>

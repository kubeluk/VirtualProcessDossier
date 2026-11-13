<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { generateLaminateQr, laminateQrFilename } from '../utils/laminateQr'

const props = defineProps<{ uri: string; name: string; identifier: string }>()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const images = ref<{ svg: string; png: string }>()
const filename = computed(() => laminateQrFilename(props.identifier))
let generation = 0
watch(
  () => props.uri,
  () => {
    generation++
    open.value = false
    busy.value = false
    error.value = ''
    images.value = undefined
  },
)
onScopeDispose(() => {
  generation++
})

async function generate() {
  open.value = true
  if (busy.value || images.value) return
  const current = ++generation
  busy.value = true
  error.value = ''
  try {
    const result = await generateLaminateQr(props.uri)
    if (current === generation) images.value = result
  } catch {
    if (current === generation) error.value = 'Could not generate the QR code. Please retry.'
  } finally {
    if (current === generation) busy.value = false
  }
}
</script>

<template>
  <div class="laminate-qr">
    <button
      class="button secondary"
      :aria-expanded="open"
      @click="open ? (open = false) : generate()"
    >
      {{ open ? 'Hide QR code' : 'Generate QR code' }}
    </button>
    <section v-if="open" class="panel" aria-label="Laminate QR code" :aria-busy="busy">
      <h2>{{ name }}</h2>
      <p>{{ identifier || 'Identifier not recorded' }}</p>
      <p class="small">Scan this code to open the laminate record through its persistent URI.</p>
      <p class="qr-uri">{{ uri }}</p>
      <p v-if="busy" role="status">Generating QR code…</p>
      <template v-if="error">
        <p class="notice error" role="alert">{{ error }}</p>
        <button class="button secondary" @click="generate">Retry</button>
      </template>
      <img v-if="images" :src="images.svg" :alt="`QR code for ${name}`" width="256" height="256" />
      <div class="button-row">
        <template v-if="images">
          <a class="button secondary" :href="images.svg" :download="filename + '.svg'"
            >Download SVG</a
          >
          <a class="button secondary" :href="images.png" :download="filename + '.png'"
            >Download PNG</a
          >
        </template>
        <template v-else>
          <button class="button secondary" disabled>Download SVG</button>
          <button class="button secondary" disabled>Download PNG</button>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.laminate-qr {
  margin-top: 20px;
}
.qr-uri {
  overflow-wrap: anywhere;
}
img {
  display: block;
  max-width: 100%;
  height: auto;
  margin-bottom: 16px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { formatNumber } from '../utils/formatNumber'
const model = defineModel<string>({ required: true })
const displayValue = computed({
  get: () => formatNumber(model.value),
  set: (value: string) => {
    model.value = value
  },
})
defineProps<{ label: string; unit: string; readonly?: boolean; help?: string; compact?: boolean }>()
</script>
<template>
  <label class="number-field" :class="{ compact }">
    <span v-if="!compact" class="field-label">{{ label }}</span>
    <span v-if="readonly" class="read-value"
      >{{ displayValue || 'Not recorded' }} <small>{{ unit }}</small></span
    >
    <span v-else class="input-unit"
      ><input
        v-model="displayValue"
        :aria-label="label"
        type="text"
        :inputmode="unit === 'unitless' ? 'numeric' : 'decimal'"
        :title="help"
        autocomplete="off"
      /><span>{{ unit }}</span></span
    >
    <small v-if="help && !compact" class="muted">{{ help }}</small>
  </label>
</template>

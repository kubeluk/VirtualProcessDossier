<script setup lang="ts">
import { computed } from 'vue'
import { NS, human } from '../domain/rdf'
import type { InitializationDraft } from '../domain/types'
import { fieldHelp, SHAPES, REFERENCE } from '../domain/initialization'
import { useKnowledgeStore } from '../stores/knowledge'
import NumberField from './NumberField.vue'
import PositionPlot from './PositionPlot.vue'
import EntityLink from './EntityLink.vue'
const model = defineModel<InitializationDraft>({ required: true })
withDefaults(defineProps<{ readonly?: boolean; section?: string }>(), { section: 'all' })
const knowledge = useKnowledgeStore()
const help = (shape: string, predicate: string) =>
  fieldHelp(knowledge.references, shape, [predicate])
const framePoints = computed(() =>
  model.value.grippers.map((p, i) => ({ name: 'Gripper ' + (i + 1), x: p.x, y: p.y })),
)
const profile = computed(() => {
  const rows = model.value.press.steps
    .map((s, i) => ({ x: i, y: Number(s.speed) }))
    .filter((p) => Number.isFinite(p.y))
  const max = Math.max(1, ...rows.map((p) => p.y)),
    min = Math.min(0, ...rows.map((p) => p.y))
  return rows
    .map(
      (p) =>
        35 +
        (p.x / Math.max(1, model.value.press.steps.length - 1)) * 310 +
        ',' +
        (150 - ((p.y - min) / (max - min)) * 115),
    )
    .join(' ')
})
function moveStep(index: number, direction: number) {
  const steps = model.value.press.steps
  const target = index + direction
  if (target < 0 || target >= steps.length) return
  const item = steps.splice(index, 1)[0]!
  steps.splice(target, 0, item)
}
</script>
<template>
  <section v-if="section === 'all' || section === 'gripping'" class="panel machine-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Gripping</p>
        <h2>Gripper frame</h2>
      </div>
      <EntityLink :uri="SHAPES.gripping" text="Accepted parameters" />
    </div>
    <p class="muted">
      Positions use the frame’s recorded reference point. Setpoints are unitless and apply to the
      named process stages.
    </p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Gripper</th>
            <th>X · mm</th>
            <th>Y · mm</th>
            <th>Gripping</th>
            <th>Heating</th>
            <th>Pressing</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(gripper, index) in model.grippers" :key="gripper.iri">
            <th><EntityLink :uri="gripper.iri" :text="'Gripper ' + (index + 1)" /></th>
            <td>
              <NumberField
                v-model="gripper.x"
                :label="'Gripper ' + (index + 1) + ' X'"
                unit="mm"
                compact
                :readonly="readonly"
              />
            </td>
            <td>
              <NumberField
                v-model="gripper.y"
                :label="'Gripper ' + (index + 1) + ' Y'"
                unit="mm"
                compact
                :readonly="readonly"
              />
            </td>
            <td v-for="stage in ['gripping', 'heating', 'pressing'] as const" :key="stage">
              <NumberField
                v-model="gripper[stage]"
                :label="'Gripper ' + (index + 1) + ' ' + stage + ' setpoint'"
                unit="unitless"
                compact
                :readonly="readonly"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="!readonly" class="button-row">
      <button
        v-for="stage in ['gripping', 'heating', 'pressing'] as const"
        :key="stage"
        type="button"
        class="button ghost"
        @click="model.grippers.forEach((g) => (g[stage] = model.grippers[0]![stage]))"
      >
        Apply gripper 1 {{ stage }} setpoint to all
      </button>
    </div>
    <PositionPlot :points="framePoints" title="Gripper positions" reference="Frame reference" />
    <p class="small">Reference: <EntityLink :uri="REFERENCE" /></p>
  </section>
  <section v-if="section === 'all' || section === 'heating'" class="panel machine-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Heating</p>
        <h2>Infrared oven</h2>
      </div>
      <EntityLink :uri="SHAPES.heating" text="Accepted parameters" />
    </div>
    <div class="field-grid">
      <NumberField
        v-model="model.oven.threshold"
        label="Threshold temperature"
        unit="°C"
        :readonly="readonly"
        :help="help(SHAPES.heating, NS.oven + 'thresholdTemperature')"
      />
      <NumberField
        v-model="model.oven.holding"
        label="Stable holding time"
        unit="s"
        :readonly="readonly"
        :help="help(SHAPES.heating, NS.oven + 'stableHoldingTime')"
      />
    </div>
    <h3>Infrared field targets</h3>
    <div class="two-columns">
      <div
        v-for="(group, groupIndex) in [model.oven.fields.slice(0, 4), model.oven.fields.slice(4)]"
        :key="groupIndex"
        class="subpanel"
      >
        <h4>{{ groupIndex === 0 ? 'Top fields' : 'Bottom fields' }}</h4>
        <div class="field-grid">
          <NumberField
            v-for="(field, index) in group"
            :key="field.iri"
            v-model="field.value"
            :label="'Field ' + (groupIndex * 4 + index + 1) + ' target'"
            unit="°C"
            :readonly="readonly"
          />
        </div>
      </div>
    </div>
    <button
      v-if="!readonly"
      type="button"
      class="button ghost"
      @click="model.oven.fields.forEach((f) => (f.value = model.oven.fields[0]!.value))"
    >
      Apply field 1 target to all fields
    </button>
    <h3>Heating devices</h3>
    <p class="small muted">
      Targets follow the declared parameter references; equipment membership is shown in Equipment.
    </p>
    <div class="field-grid">
      <NumberField
        v-for="(device, index) in model.oven.devices"
        :key="device.iri"
        v-model="device.value"
        :label="'Heating device ' + (index + 1) + ' target'"
        unit="°C"
        :readonly="readonly"
      />
    </div>
  </section>
  <section v-if="section === 'all' || section === 'pressing'" class="panel machine-panel">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Forming</p>
        <h2>Press</h2>
      </div>
      <EntityLink :uri="SHAPES.pressing" text="Accepted parameters" />
    </div>
    <div class="field-grid">
      <NumberField
        v-model="model.press.force"
        label="Press force"
        unit="kN"
        :readonly="readonly"
        :help="help(SHAPES.pressing, NS.press + 'force')"
      />
      <NumberField
        v-model="model.press.cooling"
        label="Mold cooling time"
        unit="s"
        :readonly="readonly"
        :help="help(SHAPES.pressing, NS.press + 'moldCoolingTime')"
      />
      <NumberField
        v-model="model.press.remaining"
        label="Remaining path"
        unit="mm"
        :readonly="readonly"
      />
      <NumberField
        v-for="mold in model.press.molds"
        :key="mold.iri"
        v-model="mold.value"
        :label="human(mold.iri) + ' temperature'"
        unit="°C"
        :readonly="readonly"
      />
    </div>
    <h3>Ordered closing profile</h3>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Closing speed</th>
            <th>Remaining distance</th>
            <th v-if="!readonly">Order</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(step, index) in model.press.steps" :key="index">
            <th>{{ index + 1 }}</th>
            <td>
              <NumberField
                v-model="step.speed"
                :label="'Closing step ' + (index + 1) + ' speed'"
                unit="mm/s"
                compact
                :readonly="readonly"
              />
            </td>
            <td>
              <NumberField
                v-model="step.distance"
                :label="'Closing step ' + (index + 1) + ' remaining distance'"
                unit="mm"
                compact
                :readonly="readonly"
              />
            </td>
            <td v-if="!readonly" class="button-row">
              <button
                type="button"
                class="icon-button"
                :aria-label="'Move step ' + (index + 1) + ' up'"
                :disabled="index === 0"
                @click="moveStep(index, -1)"
              >
                ↑</button
              ><button
                type="button"
                class="icon-button"
                :aria-label="'Move step ' + (index + 1) + ' down'"
                :disabled="index === model.press.steps.length - 1"
                @click="moveStep(index, 1)"
              >
                ↓</button
              ><button
                type="button"
                class="icon-button"
                :aria-label="'Remove step ' + (index + 1)"
                :disabled="model.press.steps.length === 1"
                @click="model.press.steps.splice(index, 1)"
              >
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="!readonly"
      type="button"
      class="button ghost"
      @click="model.press.steps.push({ speed: '', distance: '' })"
    >
      + Add closing step
    </button>
    <figure class="profile-plot">
      <svg viewBox="0 0 380 185" role="img" aria-label="Closing speed by ordered step">
        <title>Closing speed by ordered step</title>
        <line x1="35" y1="150" x2="350" y2="150" class="plot-axis" />
        <line x1="35" y1="25" x2="35" y2="150" class="plot-axis" />
        <polyline :points="profile" fill="none" class="profile-line" />
        <text x="160" y="175">Step order →</text>
        <text x="40" y="18">Speed · mm/s</text>
      </svg>
      <figcaption>Specified closing speeds in list order</figcaption>
    </figure>
  </section>
</template>

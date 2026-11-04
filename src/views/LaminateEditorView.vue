<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { repository } from '../services/repository'
import {
  newLaminate,
  readLaminate,
  copyLaminate,
  newLayer,
  type LaminateDraft,
} from '../domain/laminate'
import { NS, typed, label, isType } from '../domain/rdf'
import AsyncState from '../components/AsyncState.vue'
import NumberField from '../components/NumberField.vue'
const route = useRoute(),
  router = useRouter(),
  knowledge = useKnowledgeStore()
const editing = computed(() => route.path === '/laminate/edit')
const draft = ref<LaminateDraft>(),
  saving = ref(false),
  saveError = ref('')
const templateUri = ref('')
const templates = computed(() => typed(knowledge.references, NS.for + 'Laminate'))
const referencePoints = computed(() => typed(knowledge.references, NS.for + 'ReferencePoint'))
const { loading, error, reload } = useLoad(async () => {
  await knowledge.loadReferences()
  if (editing.value) {
    const uri = String(route.query.uri ?? '')
    if (!isType(knowledge.references, uri, NS.for + 'Laminate'))
      throw new Error('Laminate not found.')
    draft.value = readLaminate(knowledge.references, uri)
  } else {
    templateUri.value = String(route.query.copy ?? '')
    draft.value = templateUri.value
      ? copyLaminate(knowledge.references, templateUri.value)
      : newLaminate()
  }
  saveError.value = ''
}, [() => route.fullPath])
function useTemplate() {
  try {
    const next = templateUri.value
      ? copyLaminate(knowledge.references, templateUri.value)
      : newLaminate()
    draft.value = next
    saveError.value = ''
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not load the template.'
  }
}
function moveLayer(index: number, delta: number) {
  if (!draft.value) return
  const layers = draft.value.layers
  const layer = layers.splice(index, 1)[0]!
  layers.splice(index + delta, 0, layer)
}
async function save() {
  if (!draft.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    const uri = await repository.saveLaminate(draft.value, knowledge.references, editing.value)
    await knowledge.refresh()
    await router.push({ path: '/laminate', query: { uri } })
  } catch (e) {
    saveError.value =
      e instanceof Error ? e.message : 'Could not save the laminate. Your inputs are retained.'
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <RouterLink to="/laminates" class="back-link">← Laminates</RouterLink>
  <div class="page-heading">
    <p class="eyebrow">Material traceability</p>
    <h1>{{ editing ? 'Edit laminate' : 'Create laminate' }}</h1>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="reload">
    <form v-if="draft" novalidate @submit.prevent="save">
      <p v-if="saveError" class="notice error laminate-errors" role="alert">{{ saveError }}</p>
      <fieldset :disabled="saving" class="wizard-fields">
        <section v-if="!editing" class="panel">
          <h2>Starting point</h2>
          <label class="form-field"
            >Template
            <select v-model="templateUri" aria-label="Laminate template" @change="useTemplate">
              <option value="">Default values</option>
              <option v-for="entry in templates" :key="entry.value" :value="entry.value">
                {{ label(knowledge.references, entry) }}
              </option>
            </select>
          </label>
          <p class="small muted">
            Defaults use a 400 × 400 × 1.56 mm PA6-GF60 laminate with a [0/60/120]s layup and no
            needle points. Choosing a template replaces the form with its dimensions, layup, and
            needle points. Every new laminate receives its own identifier, which you can edit.
          </p>
        </section>
        <section class="panel">
          <h2>Identity & dimensions</h2>
          <div class="field-grid">
            <label class="form-field"
              >Name *<input v-model="draft.name" aria-label="Laminate name" required
            /></label>
            <label class="form-field"
              >Identifier *<input v-model="draft.identifier" aria-label="Identifier" required
            /></label>
            <NumberField v-model="draft.length" label="Length *" unit="mm" />
            <NumberField v-model="draft.width" label="Width *" unit="mm" />
            <NumberField v-model="draft.thickness" label="Thickness *" unit="mm" />
          </div>
          <p class="small muted">All dimensions must be positive. Fields marked * are required.</p>
        </section>
        <section class="panel">
          <h2>Ordered layup</h2>
          <label class="form-field"
            >Layup name<input v-model="draft.layupName" placeholder="e.g. [0/60/120]s"
          /></label>
          <p class="small muted">
            Add at least one tape. Layers are stored in the order shown. Editing creates a separate
            layup so shared materials retain their original values.
          </p>
          <div v-for="(layer, index) in draft.layers" :key="index" class="subpanel">
            <h3>Layer {{ index + 1 }}</h3>
            <div class="field-grid">
              <label class="form-field"
                >Polymer *<input v-model="layer.polymer" :aria-label="`Layer ${index + 1} polymer`"
              /></label>
              <label class="form-field"
                >Fiber type *<input
                  v-model="layer.fiber"
                  :aria-label="`Layer ${index + 1} fiber type`"
              /></label>
              <NumberField
                v-model="layer.fraction"
                :label="`Layer ${index + 1} fiber mass fraction *`"
                unit="%"
                help="0 to 100%"
              />
              <NumberField
                v-model="layer.angle"
                :label="`Layer ${index + 1} orientation *`"
                unit="°"
              />
            </div>
            <div class="wizard-actions">
              <button
                type="button"
                class="button secondary"
                :disabled="index === 0"
                @click="moveLayer(index, -1)"
              >
                Move up
              </button>
              <button
                type="button"
                class="button secondary"
                :disabled="index === draft.layers.length - 1"
                @click="moveLayer(index, 1)"
              >
                Move down
              </button>
              <button type="button" class="text-button" @click="draft.layers.splice(index, 1)">
                Remove layer {{ index + 1 }}
              </button>
            </div>
          </div>
          <button type="button" class="button secondary" @click="draft.layers.push(newLayer())">
            Add layer
          </button>
        </section>
        <section class="panel">
          <h2>Needle points</h2>
          <p class="small muted">
            Optional · up to 12 points. Coordinates are in millimetres relative to the selected
            reference point.
          </p>
          <div v-for="(point, index) in draft.needles" :key="index" class="subpanel">
            <h3>Needle point {{ index + 1 }}</h3>
            <div class="field-grid">
              <NumberField v-model="point.x" :label="`Point ${index + 1} X`" unit="mm" />
              <NumberField v-model="point.y" :label="`Point ${index + 1} Y`" unit="mm" />
              <label class="form-field"
                >Reference point<select
                  v-model="point.reference"
                  :aria-label="`Point ${index + 1} reference`"
                >
                  <option value="">Choose a reference…</option>
                  <option
                    v-for="reference in referencePoints"
                    :key="reference.value"
                    :value="reference.value"
                  >
                    {{ label(knowledge.references, reference) }}
                  </option>
                </select></label
              >
            </div>
            <button type="button" class="text-button" @click="draft.needles.splice(index, 1)">
              Remove point {{ index + 1 }}
            </button>
          </div>
          <button
            type="button"
            class="button secondary"
            :disabled="draft.needles.length >= 12"
            @click="
              draft.needles.push({ x: '0', y: '0', reference: referencePoints[0]?.value ?? '' })
            "
          >
            Add needle point
          </button>
        </section>
        <div class="wizard-actions">
          <RouterLink
            :to="editing ? { path: '/laminate', query: { uri: draft.uri } } : '/laminates'"
            class="button secondary"
            >Cancel</RouterLink
          >
          <button class="button primary" type="submit">
            {{ saving ? 'Saving…' : 'Save laminate' }}
          </button>
        </div>
      </fieldset>
    </form>
  </AsyncState>
</template>
<style scoped>
.laminate-errors {
  white-space: pre-line;
}
</style>

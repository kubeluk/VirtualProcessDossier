<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useKnowledgeStore } from '../stores/knowledge'
import { useLoad } from '../composables/useLoad'
import { repository, LAMINATE_IN_USE_MESSAGE } from '../services/repository'
import { NS, typed, label, value, merge, isType } from '../domain/rdf'
import {
  MODEL,
  createDraft,
  copySettings,
  draftErrors,
  initializationIris,
  validateInitialization,
} from '../domain/initialization'
import type { InitializationDraft } from '../domain/types'
import AsyncState from '../components/AsyncState.vue'
import EntityLink from '../components/EntityLink.vue'
import LaminateSummary from '../components/LaminateSummary.vue'
import MachineParameters from '../components/MachineParameters.vue'
import { formatNumber } from '../utils/formatNumber'
const SESSION_KEY = 'vpd.initialization.v1'
const route = useRoute(),
  router = useRouter(),
  knowledge = useKnowledgeStore()
const draft = ref<InitializationDraft>(),
  step = ref(1),
  machine = ref('gripping'),
  source = ref('defaults'),
  copyRun = ref(''),
  choices = ref<{ uri: string; label: string }[]>([]),
  usedLaminates = ref(new Set<string>()),
  materialSearch = ref('')
const saving = ref(false),
  errors = ref<string[]>([]),
  restored = ref(false),
  storageError = ref(''),
  submitted = ref(false)
const steps = ['Starting point', 'Run & laminate', 'Machine settings', 'Review & initialize']
const laminateUnavailable = computed(() => usedLaminates.value.has(draft.value?.laminate ?? ''))
async function loadLaminateAvailability() {
  usedLaminates.value = new Set(
    await repository.usedLaminates(draft.value ? initializationIris(draft.value).run : undefined),
  )
}
function goToStep(next: number) {
  step.value = next
  errors.value = []
}
async function loadCopy(uri: string) {
  if (!draft.value) return
  const graph = merge(knowledge.references, await repository.getRunContext(uri))
  draft.value = copySettings(graph, uri, knowledge.references, draft.value.id)
  draft.value.laminate = ''
  source.value = 'copy'
  copyRun.value = uri
}
const { loading, error, reload } = useLoad(async () => {
  await knowledge.loadReferences()
  choices.value = (await repository.facets()).filter((f) => f.kind === 'run')
  if (draft.value) {
    await loadLaminateAvailability()
    return
  }
  if (!isType(knowledge.references, MODEL, NS.wild + 'WorkflowModel'))
    throw new Error('The stamp-forming process is not available. Check the example data.')
  let saved:
    | {
        draft: InitializationDraft & {
          oven: InitializationDraft['oven'] & { devices?: InitializationDraft['press']['devices'] }
        }
        step: number
        machine: string
      }
    | undefined
  if (!route.query.copy && (!route.query.laminate || route.query.runDraft)) {
    try {
      const text = sessionStorage.getItem(SESSION_KEY)
      if (text) saved = JSON.parse(text) as typeof saved
    } catch {
      storageError.value = 'A previous draft could not be restored.'
    }
  }
  if (
    saved?.draft &&
    typeof saved.draft.id === 'string' &&
    (!route.query.runDraft || saved.draft.id === route.query.runDraft) &&
    Array.isArray(saved.draft.grippers) &&
    Array.isArray(saved.draft.press?.steps) &&
    Array.isArray(saved.draft.oven?.fields) &&
    Array.isArray(saved.draft.press?.devices ?? saved.draft.oven?.devices)
  ) {
    // Retain heater values from drafts saved before the fields moved to the press.
    const { devices: legacyDevices, ...oven } = saved.draft.oven
    draft.value = {
      ...saved.draft,
      oven,
      press: { ...saved.draft.press, devices: saved.draft.press.devices ?? legacyDevices! },
    }
    step.value = Math.min(4, Math.max(1, Number(saved.step) || 1))
    machine.value = ['gripping', 'heating', 'pressing'].includes(saved.machine)
      ? saved.machine
      : 'gripping'
    restored.value = true
    source.value = saved.draft.copiedFrom ? 'copy' : 'defaults'
    copyRun.value = saved.draft.copiedFrom
  } else {
    if (route.query.runDraft)
      throw new Error(
        'The run draft could not be restored. Open run preparation to start a new draft.',
      )
    draft.value = createDraft(knowledge.references)
  }
  if (route.query.runDraft) step.value = 2
  if (route.query.copy) {
    await loadCopy(String(route.query.copy))
    step.value = 2
  }
  if (route.query.laminate && draft.value) {
    draft.value.laminate = String(route.query.laminate)
    draft.value.laminateConfirmed = false
    step.value = 2
  }
  await loadLaminateAvailability()
  if (route.query.copy || route.query.laminate || route.query.runDraft)
    await router.replace({ path: '/runs/new' })
}, [() => knowledge.revision])
const availableLaminate = computed(() =>
  typed(knowledge.references, NS.for + 'Laminate').some((t) => !usedLaminates.value.has(t.value)),
)
const laminates = computed(() =>
  typed(knowledge.references, NS.for + 'Laminate').filter((t) =>
    (label(knowledge.references, t) + ' ' + value(knowledge.references, t, NS.dct + 'identifier'))
      .toLowerCase()
      .includes(materialSearch.value.toLowerCase()),
  ),
)
function persist() {
  if (!draft.value || submitted.value) return false
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ draft: draft.value, step: step.value, machine: machine.value }),
    )
    return true
  } catch {
    storageError.value =
      'This browser cannot retain your draft between page loads. Keep this tab open until submission.'
    return false
  }
}
async function createLaminate() {
  if (!draft.value || !persist()) return
  await router.push({ path: '/laminates/new', query: { runDraft: draft.value.id } })
}
watch([draft, step, machine], persist, { deep: true })
onBeforeUnmount(persist)
function reset() {
  draft.value = createDraft(knowledge.references)
  step.value = 1
  machine.value = 'gripping'
  source.value = 'defaults'
  copyRun.value = ''
  errors.value = []
  restored.value = false
}
async function next() {
  if (!draft.value || saving.value) return
  errors.value = []
  saving.value = true
  try {
    if (step.value >= 2) {
      await loadLaminateAvailability()
      if (laminateUnavailable.value) throw new Error(LAMINATE_IN_USE_MESSAGE)
    }
    if (step.value === 1) {
      if (source.value === 'copy') {
        if (!copyRun.value) throw new Error('Choose a previous run.')
        if (draft.value.copiedFrom !== copyRun.value) await loadCopy(copyRun.value)
      } else if (draft.value.copiedFrom) {
        draft.value = createDraft(knowledge.references, draft.value.id)
      }
    }
    if (step.value === 2) {
      if (!draft.value.name.trim()) errors.value.push('Enter a run name.')
      if (
        !draft.value.laminate ||
        !isType(knowledge.references, draft.value.laminate, NS.for + 'Laminate')
      )
        errors.value.push('Select a registered laminate.')
      if (!draft.value.laminateConfirmed) errors.value.push('Confirm the input laminate.')
    }
    if (step.value === 3) {
      errors.value = draftErrors(draft.value, knowledge.references)
      if (!errors.value.length) await validateInitialization(draft.value, knowledge.references)
    }
    if (!errors.value.length) {
      step.value = Math.min(4, step.value + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  } catch (e) {
    errors.value = [e instanceof Error ? e.message : 'Could not prepare this run.']
  } finally {
    saving.value = false
  }
}
async function submit() {
  if (!draft.value || saving.value) return
  errors.value = []
  saving.value = true
  try {
    await loadLaminateAvailability()
    if (laminateUnavailable.value) throw new Error(LAMINATE_IN_USE_MESSAGE)
    const uri = await repository.initializeRun(draft.value, knowledge.references)
    submitted.value = true
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* Saving to the graph succeeded. */
    }
    knowledge.revision++
    await router.push({ path: '/run', query: { uri } })
  } catch (e) {
    errors.value = [
      e instanceof Error ? e.message : 'Could not initialize the run. Your draft is retained.',
    ]
    if (e instanceof Error && e.message === LAMINATE_IN_USE_MESSAGE)
      usedLaminates.value = new Set([...usedLaminates.value, draft.value.laminate])
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <RouterLink to="/runs" class="back-link">← Production runs</RouterLink>
  <div class="page-heading">
    <p class="eyebrow">Run preparation</p>
    <h1>Prepare the next run.</h1>
    <p class="lede">
      Choose the laminate, specify the settings, and save the initialization for the demonstrator.
    </p>
  </div>
  <AsyncState :loading="loading" :error="error" @retry="reload">
    <template v-if="draft">
      <p v-if="restored" class="notice small">
        Your unsaved draft has been restored.
        <button class="text-button" @click="reset">Start a fresh draft</button>
      </p>
      <p v-if="storageError" class="notice small">{{ storageError }}</p>
      <p v-if="laminateUnavailable" class="notice error" role="alert">
        {{ LAMINATE_IN_USE_MESSAGE }}
      </p>
      <ol class="wizard-steps" aria-label="Preparation steps">
        <li
          v-for="(title, index) in steps"
          :key="title"
          :class="{ current: step === index + 1, complete: step > index + 1 }"
        >
          <button
            :disabled="index + 1 > step || saving"
            :aria-current="step === index + 1 ? 'step' : undefined"
            @click="goToStep(index + 1)"
          >
            <span>{{ index + 1 }}</span
            >{{ title }}
          </button>
        </li>
      </ol>
      <div v-if="errors.length" class="notice error" role="alert">
        <strong>Check the initialization</strong>
        <ul>
          <li v-for="message in errors" :key="message">{{ message }}</li>
        </ul>
      </div>
      <form novalidate @submit.prevent="step === 4 ? submit() : next()">
        <fieldset :disabled="saving" class="wizard-fields">
          <section v-if="step === 1" class="panel">
            <p class="eyebrow">Step 01</p>
            <h2>How would you like to begin?</h2>
            <p class="muted">
              Process: <EntityLink :uri="draft.model" text="Stamp forming" kind="process" />
            </p>
            <div class="choice-grid">
              <label class="choice-card" :class="{ chosen: source === 'defaults' }"
                ><input v-model="source" type="radio" value="defaults" name="source" /><span
                  ><strong>Start from defaults</strong
                  ><small
                    >Use the declared machine defaults and enter this run’s gripper
                    positions.</small
                  ></span
                ></label
              ><label class="choice-card" :class="{ chosen: source === 'copy' }"
                ><input v-model="source" type="radio" value="copy" name="source" /><span
                  ><strong>Copy a previous run</strong
                  ><small
                    >Reuse its specified settings, then choose an unused laminate and review every
                    machine.</small
                  ></span
                ></label
              >
            </div>
            <label v-if="source === 'copy'" class="form-field"
              >Previous run<select v-model="copyRun">
                <option value="">Choose a run…</option>
                <option v-for="run in choices" :key="run.uri" :value="run.uri">
                  {{ run.label }}
                </option>
              </select></label
            >
            <p class="small muted">
              Choosing a different starting point replaces the draft’s machine settings.
            </p>
          </section>
          <section v-else-if="step === 2" class="panel">
            <p class="eyebrow">Step 02</p>
            <h2>Identify the run and its input.</h2>
            <div class="field-grid">
              <label class="form-field"
                >Run name <span class="required">*</span
                ><input
                  v-model="draft.name"
                  aria-label="Run name"
                  required
                  placeholder="e.g. Heating study · trial 04" /></label
              ><label class="form-field"
                >Notes<textarea
                  v-model="draft.notes"
                  aria-label="Run notes"
                  rows="3"
                  placeholder="Purpose or useful context for this run"
                />
              </label>
            </div>
            <h3>Choose a laminate</h3>
            <p class="small muted">
              A laminate can only be used to initialize one run, including completed runs.
            </p>
            <p v-if="!availableLaminate" class="notice">
              No unused laminates are available. Create a laminate to continue.
            </p>
            <div class="wizard-actions">
              <button type="button" class="button secondary" @click="createLaminate">
                Create a new laminate
              </button>
              <span class="small muted">Return here with the new laminate selected.</span>
            </div>
            <label class="search-field"
              ><span class="sr-only">Search laminates</span
              ><input
                v-model="materialSearch"
                type="search"
                placeholder="Search laminate name or identifier…"
            /></label>
            <div class="choice-grid laminate-choices">
              <label
                v-for="laminate in laminates"
                :key="laminate.value"
                class="choice-card"
                :class="{
                  chosen: draft.laminate === laminate.value,
                  unavailable: usedLaminates.has(laminate.value),
                }"
                ><input
                  v-model="draft.laminate"
                  type="radio"
                  :value="laminate.value"
                  name="laminate"
                  :disabled="usedLaminates.has(laminate.value)"
                  @change="draft.laminateConfirmed = false"
                /><span
                  ><strong>{{ label(knowledge.references, laminate) }}</strong
                  ><small>{{ value(knowledge.references, laminate, NS.dct + 'identifier') }}</small>
                  <small v-if="usedLaminates.has(laminate.value)">
                    Already assigned to a run · unavailable
                  </small></span
                ></label
              >
            </div>
            <p v-if="!laminates.length" class="notice">No matching laminates are registered.</p>
            <div v-if="draft.laminate" class="subpanel">
              <EntityLink
                :uri="draft.laminate"
                kind="laminate"
                text="Open laminate details"
              /><LaminateSummary :uri="draft.laminate" /><label class="confirm-field"
                ><input
                  v-model="draft.laminateConfirmed"
                  type="checkbox"
                  :disabled="laminateUnavailable"
                />I confirm this is the input laminate for this run.</label
              >
            </div>
          </section>
          <template v-else-if="step === 3"
            ><nav class="machine-tabs" aria-label="Machine settings">
              <button
                v-for="item in [
                  { id: 'gripping', label: 'Gripper frame' },
                  { id: 'heating', label: 'Infrared oven' },
                  { id: 'pressing', label: 'Press' },
                ]"
                :key="item.id"
                type="button"
                :class="{ active: machine === item.id }"
                :aria-current="machine === item.id ? 'page' : undefined"
                @click="machine = item.id"
              >
                {{ item.label }}
              </button>
            </nav>
            <MachineParameters v-model="draft" :section="machine"
          /></template>
          <template v-else>
            <section class="panel">
              <p class="eyebrow">Step 04</p>
              <h2>Review the initialization.</h2>
              <dl class="compact-facts">
                <dt>Run</dt>
                <dd>{{ draft.name }}</dd>
                <dt>Notes</dt>
                <dd>{{ draft.notes || 'None' }}</dd>
                <dt>Process</dt>
                <dd><EntityLink :uri="draft.model" kind="process" /></dd>
                <dt>Input laminate</dt>
                <dd><EntityLink :uri="draft.laminate" kind="laminate" /></dd>
                <dt>Starting point</dt>
                <dd>
                  <EntityLink v-if="draft.copiedFrom" :uri="draft.copiedFrom" kind="run" /><span
                    v-else
                    >Declared defaults and entered values</span
                  >
                </dd>
              </dl>
              <p class="notice small">
                Initializing saves the input, machine settings, and initialized workflow groups.
                The shop-floor system creates atomic activity instances and records execution
                state, timing, observations, and datasets.
              </p>
            </section>
            <details
              v-for="item in [
                {
                  id: 'gripping',
                  name: 'Gripper frame',
                  summary: draft.grippers.length + ' positions · 24 stage setpoints',
                },
                {
                  id: 'heating',
                  name: 'Infrared oven',
                  summary:
                    formatNumber(draft.oven.threshold) +
                    ' °C threshold · ' +
                    formatNumber(draft.oven.holding) +
                    ' s holding time',
                },
                {
                  id: 'pressing',
                  name: 'Press',
                  summary:
                    formatNumber(draft.press.force) +
                    ' kN · ' +
                    draft.press.steps.length +
                    ' closing steps',
                },
              ]"
              :key="item.id"
              class="review-disclosure"
            >
              <summary>
                <strong>{{ item.name }}</strong
                ><span class="muted">{{ item.summary }}</span
                ><span>Inspect settings ↓</span>
              </summary>
              <MachineParameters :model-value="draft" :section="item.id" readonly />
            </details>
          </template>
          <div class="wizard-actions">
            <button
              v-if="step > 1"
              class="button secondary"
              type="button"
              @click="goToStep(step - 1)"
            >
              ← Back</button
            ><button v-else class="text-button" type="button" @click="reset">Reset draft</button
            ><span class="small muted">Draft retained in this tab</span
            ><button
              type="submit"
              class="button primary"
              :disabled="step > 1 && laminateUnavailable"
            >
              {{
                saving
                  ? 'Working…'
                  : step === 4
                    ? 'Initialize run'
                    : step === 3
                      ? 'Review initialization →'
                      : 'Continue →'
              }}
            </button>
          </div>
        </fieldset>
      </form>
    </template>
  </AsyncState>
</template>

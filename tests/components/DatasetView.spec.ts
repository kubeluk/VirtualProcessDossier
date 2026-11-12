// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import DatasetView from '../../src/views/DatasetView.vue'
import { NS, parse } from '../../src/domain/rdf'
import { repository } from '../../src/services/repository'
import { useKnowledgeStore } from '../../src/stores/knowledge'

afterEach(() => vi.restoreAllMocks())

async function render(distributionCount: number, connected = true) {
  const declarations = Object.entries(NS)
    .map(([prefix, iri]) => `@prefix ${prefix}: <${iri}> .`)
    .join('\n')
  const turtle = `
    ${declarations}
    <urn:test:dataset> a dcat:Dataset ; dct:title "Test dataset" ;
      prov:wasGeneratedBy <urn:test:observation> ;
      ${Array.from(
        { length: distributionCount },
        () => `dcat:distribution [ a dcat:Distribution ;
          dcat:mediaType "text/tab-separated-values" ;
          dcat:downloadURL <https://example.org/data.tsv> ;
          dcat:temporalResolution "PT1S"^^xsd:duration ]`,
      ).join(' ; ')} .
    <urn:test:observation> a sosa:Observation ; sosa:madeBySensor <urn:test:sensor> .
    ${
      connected
        ? `<urn:test:observation> wild:inWorkflowInstance <urn:test:run> .
          <urn:test:run> a wild:WorkflowInstance ; rdfs:label "Test run" ;
            wild:workflowInstanceOf <urn:test:process> ;
            for:workflowInitialization [ for:laminate <urn:test:laminate> ] .`
        : ''
    }
  `
  // Separate CONSTRUCT responses give the same anonymous distributions different identities.
  vi.spyOn(repository, 'getDatasetContext').mockResolvedValue(parse(turtle))
  vi.spyOn(repository, 'getRunContext').mockResolvedValue(parse(turtle))
  const pinia = createPinia()
  setActivePinia(pinia)
  const knowledge = useKnowledgeStore()
  knowledge.loaded = true
  knowledge.references = parse(`
    <urn:test:sensor> <${NS.rdfs}label> "Test sensor" .
    <urn:test:process> <${NS.rdfs}label> "Test process" .
    <urn:test:laminate> <${NS.rdfs}label> "Test laminate" .
  `)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push({ path: '/dataset', query: { uri: 'urn:test:dataset' } })
  const wrapper = mount(DatasetView, {
    global: { plugins: [pinia, router], stubs: { AllMetadata: true } },
  })
  await flushPromises()
  return wrapper
}

it.each([1, 2])(
  'shows %i recorded distributions once each while retaining production context',
  async (count) => {
    const wrapper = await render(count)
    expect(wrapper.findAll('.distribution-row')).toHaveLength(count)
    expect(wrapper.findAll('.distribution-row a').map((link) => link.attributes('href'))).toEqual(
      Array(count).fill('https://example.org/data.tsv'),
    )
    expect(wrapper.text()).toContain('Test run')
    expect(wrapper.text()).toContain('Test process')
    expect(wrapper.text()).toContain('Test laminate')
    expect(wrapper.text()).toContain('Test sensor')
    wrapper.unmount()
  },
)

it('shows a standalone distribution without inventing run context', async () => {
  const wrapper = await render(1, false)
  expect(wrapper.findAll('.distribution-row')).toHaveLength(1)
  expect(wrapper.text()).toContain('Run context not recorded.')
  expect(wrapper.text()).not.toContain('Test run')
  expect(repository.getRunContext).not.toHaveBeenCalled()
  wrapper.unmount()
})

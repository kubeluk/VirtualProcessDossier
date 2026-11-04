// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import MetadataValue from '../../src/components/MetadataValue.vue'
import EntityLink from '../../src/components/EntityLink.vue'
import { NS, Store, df, n, object, parse, value, type Term } from '../../src/domain/rdf'

async function render(graph: Store, term: Term, ancestors: string[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/')
  return mount(MetadataValue, {
    props: { graph, term, ancestors },
    global: { plugins: [createPinia(), router] },
  })
}

describe('quantity metadata', () => {
  it.each(['blank', 'named'] as const)(
    'shows an inline quantity and preserves the recorded literal for a %s node',
    async (kind) => {
      const term = kind === 'blank' ? df.blankNode() : n('urn:test:dimension')
      const graph = new Store([
        df.quad(term, n(NS.qudt + 'value'), df.literal('400.0', n(NS.xsd + 'decimal'))),
        df.quad(term, n(NS.qudt + 'hasUnit'), n(NS.unit + 'MilliM')),
      ])
      const wrapper = await render(graph, term)
      expect(wrapper.get('summary').text()).toBe('400 mm')
      const details = wrapper.get('details.nested-metadata')
      const element = details.element as HTMLDetailsElement
      element.open = true
      await details.trigger('toggle')
      const literal = wrapper.get('.literal')
      expect(literal.element.firstChild?.textContent?.trim()).toBe('400')
      expect(literal.text()).toContain('Recorded value: 400.0')
      expect(value(graph, term, NS.qudt + 'value')).toBe('400.0')
      const record = wrapper
        .findAllComponents(EntityLink)
        .find((link) => link.props('uri') === term.value)
      if (kind === 'named') {
        expect(record?.text()).toContain('Open record')
      } else expect(record).toBeUndefined()
    },
  )

  it('formats vector values and expands named RDF lists in their recorded order', async () => {
    const graph = parse(`
      @prefix qudt: <${NS.qudt}> .
      @prefix rdf: <${NS.rdf}> .
      <urn:test:position> qudt:hasUnit <${NS.unit}MilliM> ; qudt:value <urn:test:first> .
      <urn:test:first> rdf:first 190.0 ; rdf:rest <urn:test:second> .
      <urn:test:second> rdf:first -100.0 ; rdf:rest rdf:nil .
    `)
    const term = n('urn:test:position')
    const wrapper = await render(graph, term)
    expect(wrapper.get('summary').text()).toBe('190, -100 mm')
    const list = await render(graph, object(graph, term, NS.qudt + 'value')!)
    expect(list.get('summary').text()).toBe('Ordered list')
    const details = list.get('details')
    const element = details.element as HTMLDetailsElement
    element.open = true
    await details.trigger('toggle')
    expect(
      list.findAll('ol > li .literal').map((item) => item.element.firstChild?.textContent?.trim()),
    ).toEqual(['190', '-100'])
    expect(list.getComponent(EntityLink).props('uri')).toBe('urn:test:first')
    const cycle = await render(graph, term, [term.value])
    expect(cycle.text()).toBe('Already shown above')
    expect(cycle.find('details').exists()).toBe(false)
  })

  it('keeps numeric-looking identifiers and language-tagged text unchanged', async () => {
    for (const term of [df.literal('400.0'), df.literal('400.0', 'en')]) {
      const wrapper = await render(new Store(), term)
      expect(wrapper.get('.literal').element.firstChild?.textContent?.trim()).toBe('400.0')
      expect(wrapper.text()).not.toContain('Recorded value:')
      if (term.language) expect(wrapper.text()).toContain('[en]')
    }
  })

  it('retains links for resources without recorded quantity values', async () => {
    const term = n('urn:test:unrecorded')
    const wrapper = await render(new Store(), term)
    expect(wrapper.getComponent(EntityLink).props('uri')).toBe(term.value)
    expect(wrapper.find('details').exists()).toBe(false)
  })
})

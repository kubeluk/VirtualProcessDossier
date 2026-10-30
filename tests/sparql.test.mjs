import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import axios from 'axios'

const source = readFileSync(new URL('../src/services/sparql.ts', import.meta.url), 'utf8')
const compiled = ts
  .transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace("from 'axios'", `from ${JSON.stringify(import.meta.resolve('axios'))}`)
const { querySparql } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
)

test('large SPARQL queries use the POST body instead of a proxy-limited URL', async () => {
  const original = axios.defaults.adapter
  const result = { head: { vars: [] }, results: { bindings: [] } }
  const query =
    'SELECT * WHERE { VALUES ?root { ' +
    Array.from({ length: 141 }, (_, i) => `<http://purl.org/for/data/laminate/${i}#it>`).join(' ') +
    ' } ?root ?p ?o }'
  axios.defaults.adapter = async (config) => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/sparql')
    assert.equal(config.params, undefined)
    assert.equal(config.data, query)
    assert.equal(config.headers.get('Content-Type'), 'application/sparql-query')
    return { data: result, status: 200, statusText: 'OK', headers: {}, config }
  }
  try {
    assert.deepEqual(await querySparql('/sparql', query), result)
  } finally {
    axios.defaults.adapter = original
  }
})

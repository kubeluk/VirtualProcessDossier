import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer as createViteServer } from 'vite'
import viteConfig from '../../vite.config'
import { backendConfig, backendProxy } from '../../scripts/proxy-config'

const remoteEnv = {
  FUSEKI_PROXY_TARGET: 'https://store.example.org/fuseki/',
  FUSEKI_DATASET: 'production',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('backend selection', () => {
  it('keeps the local defaults and existing administrator password', () => {
    expect(backendConfig('development', { ADMIN_PASSWORD: 'local-secret' })).toEqual({
      target: 'http://localhost:3030',
      dataset: 'vpd',
      authorization: 'Basic ' + Buffer.from('admin:local-secret').toString('base64'),
    })
  })

  it('does not reuse the local administrator credential for the remote backend', () => {
    expect(backendConfig('remote', { ...remoteEnv, ADMIN_PASSWORD: 'local-secret' })).toEqual({
      target: 'https://store.example.org/fuseki',
      dataset: 'production',
      authorization: undefined,
    })
  })

  it.each(['FUSEKI_PROXY_TARGET', 'FUSEKI_DATASET'])('requires an explicit remote %s', (key) => {
    expect(() => backendConfig('remote', { ...remoteEnv, [key]: undefined })).toThrow(
      'Set FUSEKI_PROXY_TARGET and FUSEKI_DATASET',
    )
  })

  it.each([
    'ftp://store.example.org',
    'https://user:secret@store.example.org',
    'https://store.example.org?dataset=vpd',
    'https://store.example.org#fragment',
    'https://store.example.org;other',
    'https://store.example.org\n',
  ])('rejects an invalid upstream URL: %j', (target) => {
    expect(() => backendConfig('remote', { ...remoteEnv, FUSEKI_PROXY_TARGET: target })).toThrow()
  })

  it.each(['vpd/path', 'vpd\n', 'vpd;other'])('rejects an invalid dataset: %j', (dataset) => {
    expect(() => backendConfig('remote', { ...remoteEnv, FUSEKI_DATASET: dataset })).toThrow(
      'Invalid FUSEKI_DATASET',
    )
  })

  it('requires paired credentials and permits explicitly disabling local authentication', () => {
    expect(() => backendConfig('remote', { ...remoteEnv, FUSEKI_USERNAME: 'writer' })).toThrow(
      'Set both',
    )
    expect(
      backendConfig('development', { FUSEKI_USERNAME: '', FUSEKI_PASSWORD: '' }).authorization,
    ).toBeUndefined()
  })

  it.each(['FUSEKI_USERNAME', 'FUSEKI_PASSWORD'])(
    'does not fill a partial local %s credential from administrator defaults',
    (key) => {
      expect(() => backendConfig('development', { [key]: 'custom' })).toThrow('Set both')
    },
  )

  it('loads mode-specific backend files and keeps development origins separate', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vpd-env-'))
    try {
      await writeFile(
        join(directory, '.env.development.local'),
        'FUSEKI_PROXY_TARGET=http://localhost:3030\nFUSEKI_DATASET=local\n',
      )
      await writeFile(
        join(directory, '.env.remote.local'),
        'FUSEKI_PROXY_TARGET=https://store.example.org\nFUSEKI_DATASET=remote\n',
      )
      for (const key of [
        'FUSEKI_PROXY_TARGET',
        'FUSEKI_DATASET',
        'FUSEKI_USERNAME',
        'FUSEKI_PASSWORD',
        'ADMIN_PASSWORD',
      ])
        vi.stubEnv(key, undefined)
      vi.spyOn(process, 'cwd').mockReturnValue(directory)
      const local = viteConfig({ command: 'serve', mode: 'development' })
      const remote = viteConfig({ command: 'serve', mode: 'remote' })
      expect(local.server).toMatchObject({ port: 5173, strictPort: true })
      expect(remote.server).toMatchObject({ port: 5174, strictPort: true })
      expect(local.server?.proxy?.['^/sparql(?:\\?|$)']).toMatchObject({
        target: 'http://localhost:3030',
      })
      expect(remote.server?.proxy?.['^/sparql(?:\\?|$)']).toMatchObject({
        target: 'https://store.example.org',
      })
      vi.stubEnv('FUSEKI_PROXY_TARGET', 'https://override.example.org')
      expect(
        viteConfig({ command: 'serve', mode: 'remote' }).server?.proxy?.['^/sparql(?:\\?|$)'],
      ).toMatchObject({ target: 'https://override.example.org' })
    } finally {
      vi.restoreAllMocks()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not need backend configuration when building', () => {
    for (const key of ['FUSEKI_PROXY_TARGET', 'FUSEKI_DATASET']) vi.stubEnv(key, undefined)
    expect(viteConfig({ command: 'build', mode: 'remote' }).server).toBeUndefined()
  })
})

describe('Vite HTTP proxy', () => {
  let upstream: Server
  let target: string
  let directory: string
  let requests = 0

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vpd-proxy-'))
    upstream = createHttpServer(async (request, response) => {
      requests++
      let body = ''
      for await (const chunk of request) body += chunk
      response.statusCode = request.url?.includes('/update') ? 409 : 200
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('X-Fixture', 'upstream')
      response.end(
        JSON.stringify({
          path: request.url,
          method: request.method,
          host: request.headers.host,
          authorization: request.headers.authorization,
          contentType: request.headers['content-type'],
          body,
        }),
      )
    })
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.listen(0, '127.0.0.1', resolve)
    })
    target = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    if (upstream.listening)
      await new Promise<void>((resolve, reject) =>
        upstream.close((error) => (error ? reject(error) : resolve())),
      )
    await rm(directory, { recursive: true, force: true })
  })

  it.each([false, true])(
    'forwards queries and updates with configured authentication=%s',
    async (basic) => {
      const backend = backendConfig('remote', {
        FUSEKI_PROXY_TARGET: target + '/gateway/',
        FUSEKI_DATASET: 'vpd',
        ...(basic ? { FUSEKI_USERNAME: 'writer', FUSEKI_PASSWORD: 'fixture-secret' } : {}),
      })
      const vite = await createViteServer({
        configFile: false,
        root: directory,
        logLevel: 'silent',
        appType: 'custom',
        optimizeDeps: { noDiscovery: true },
        server: { host: '127.0.0.1', port: 0, proxy: backendProxy(backend) },
      })
      try {
        await vite.listen()
        const origin = `http://127.0.0.1:${(vite.httpServer!.address() as AddressInfo).port}`
        for (const endpoint of ['sparql', 'update']) {
          const body = new URLSearchParams({
            [endpoint === 'sparql' ? 'query' : 'update']: 'fixture + & ?',
          }).toString()
          const response = await fetch(origin + '/' + endpoint + '?format=json', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Basic browser-credential',
            },
            body,
          })
          expect(response.status).toBe(endpoint === 'sparql' ? 200 : 409)
          expect(response.headers.get('X-Fixture')).toBe('upstream')
          expect(await response.json()).toEqual({
            path: `/gateway/vpd/${endpoint}?format=json`,
            method: 'POST',
            host: new URL(target).host,
            ...(basic ? { authorization: backend.authorization } : {}),
            contentType: 'application/x-www-form-urlencoded',
            body,
          })
        }
        const before = requests
        expect((await fetch(origin + '/sparql-extra')).status).toBe(404)
        expect(requests).toBe(before)
      } finally {
        await vite.close()
      }
    },
  )
})

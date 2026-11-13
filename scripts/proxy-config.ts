import type { ProxyOptions } from 'vite'

export interface BackendConfig {
  target: string
  dataset: string
  authorization?: string
}

export function backendConfig(
  mode: string,
  env: Record<string, string | undefined>,
): BackendConfig {
  const remote = mode === 'remote'
  const target = (env.FUSEKI_PROXY_TARGET ?? (remote ? '' : 'http://localhost:3030')).replace(
    /\/+$/,
    '',
  )
  const dataset = env.FUSEKI_DATASET ?? (remote ? '' : 'vpd')
  if (!target || !dataset)
    throw new Error('Set FUSEKI_PROXY_TARGET and FUSEKI_DATASET for the remote backend.')

  // Keep the same URL restrictions as the nginx entrypoint, including optional path prefixes.
  if (
    /\s/.test(target) ||
    !/^https?:\/\/(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9._-]+)(:[0-9]{1,5})?(\/[a-zA-Z0-9._~%/-]*)?$/.test(
      target,
    )
  )
    throw new Error(
      'FUSEKI_PROXY_TARGET must be an HTTP(S) base URL without credentials or a query.',
    )
  new URL(target)
  if (!/^[a-zA-Z0-9_-]+$/.test(dataset) || /\s/.test(dataset))
    throw new Error('Invalid FUSEKI_DATASET name.')

  const explicitCredentials = env.FUSEKI_USERNAME !== undefined || env.FUSEKI_PASSWORD !== undefined
  const username = explicitCredentials ? (env.FUSEKI_USERNAME ?? '') : remote ? '' : 'admin'
  const password = explicitCredentials
    ? (env.FUSEKI_PASSWORD ?? '')
    : remote
      ? ''
      : (env.ADMIN_PASSWORD ?? 'admin')
  if (Boolean(username) !== Boolean(password))
    throw new Error('Set both FUSEKI_USERNAME and FUSEKI_PASSWORD, or leave both empty.')
  if (username.includes(':')) throw new Error('FUSEKI_USERNAME must not contain a colon.')

  return {
    target,
    dataset,
    authorization: username
      ? 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
      : undefined,
  }
}

export function backendProxy(config: BackendConfig): Record<string, ProxyOptions> {
  const options: ProxyOptions = {
    target: config.target,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => '/' + config.dataset + path,
    configure(proxy) {
      proxy.on('proxyReq', (request) => {
        if (config.authorization) request.setHeader('Authorization', config.authorization)
        else request.removeHeader('Authorization')
      })
    },
  }
  return { '^/sparql(?:\\?|$)': options, '^/update(?:\\?|$)': options }
}

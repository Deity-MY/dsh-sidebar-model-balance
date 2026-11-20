/**
 * Host half of the sidebar model/balance bundle.
 *
 * The DeepSeek account balance needs no Host code: the Client card reads it
 * through the account service. Any other provider balance does: the browser
 * cannot reach those endpoints (CORS), and the API key must stay on the Host in
 * the credential store. This route answers one provider balance at a time, so
 * the Client never holds a key.
 */

const ROUTE_PATH = '/dsh-provider-balance'
const CACHE_TTL_MS = 30000

/**
 * Readable providers, keyed by the model provider id the Client sees. `moonshot`
 * is the id this profile configures; the other spellings cover the built-in
 * pi-ai ids for the same service.
 */
const PROVIDERS = {
  moonshot: {
    baseURL: 'https://api.moonshot.cn/v1',
    credentialRef: 'MOONSHOT_API_KEY',
    currency: 'CNY',
  },
  'moonshot-cn': {
    baseURL: 'https://api.moonshot.cn/v1',
    credentialRef: 'MOONSHOT_API_KEY',
    currency: 'CNY',
  },
  moonshotai: {
    baseURL: 'https://api.moonshot.ai/v1',
    credentialRef: 'MOONSHOT_API_KEY',
    currency: 'USD',
  },
  'moonshotai-cn': {
    baseURL: 'https://api.moonshot.cn/v1',
    credentialRef: 'MOONSHOT_API_KEY',
    currency: 'CNY',
  },
}

export const inject = ['webServer', 'credentials']

export function apply(ctx) {
  const cache = new Map()

  const readBalance = async provider => {
    const entry = PROVIDERS[provider]
    if (entry === undefined) return { status: 'unknown-provider' }
    const hit = await ctx.credentials.resolve(entry.credentialRef)
    const key = hit === undefined ? undefined : hit.value
    if (typeof key !== 'string' || key === '') {
      return { status: 'no-credential', credentialRef: entry.credentialRef }
    }
    const response = await fetch(`${entry.baseURL}/users/me/balance`, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
    })
    if (!response.ok) return { status: 'failed', detail: `HTTP ${response.status}` }
    const body = await response.json()
    const data = body === null || typeof body !== 'object' ? {} : body.data ?? {}
    const available = Number(data.available_balance)
    if (!Number.isFinite(available)) return { status: 'failed', detail: 'unexpected response' }
    return {
      status: 'ready',
      provider,
      currency: entry.currency,
      available,
      voucher: Number(data.voucher_balance ?? 0) || 0,
      cash: Number(data.cash_balance ?? 0) || 0,
      fetchedAt: Date.now(),
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    resource: async request => {
      // Same-origin reads from the page carry no Origin header; the desktop
      // renderer speaks for `dsh-app://app`. Anything else is another origin
      // and is not served.
      const origin = request.headers.get('origin')
      if (origin !== null && !isAllowedOrigin(origin)) {
        return answer({ status: 'forbidden' }, 403)
      }
      const provider = new URL(request.url).searchParams.get('provider') ?? ''
      const cached = cache.get(provider)
      if (cached !== undefined && Date.now() - cached.at < CACHE_TTL_MS) {
        return answer(cached.value)
      }
      let value
      try {
        value = await readBalance(provider)
      } catch (error) {
        ctx.logger.warn(error instanceof Error ? error : new Error(String(error)))
        value = { status: 'failed', detail: 'request failed' }
      }
      if (value.status === 'ready') cache.set(provider, { at: Date.now(), value })
      return answer(value)
    },
  }), 'sidebar-model-balance: provider balance route')
}

function isAllowedOrigin(origin) {
  if (origin === 'dsh-app://app') return true
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return url.hostname === '127.0.0.1'
      || url.hostname === 'localhost'
      || url.hostname === '[::1]'
      || url.hostname === '::1'
  } catch {
    return false
  }
}

function answer(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

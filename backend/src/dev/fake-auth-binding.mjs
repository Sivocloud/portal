/**
 * backend/src/dev/fake-auth-binding.mjs — Dev-only mock de `env.AUTH`
 * (Service Binding RPC).
 *
 * Mismo patrón que apps/sivo-pos/backend/src/dev/fake-auth-binding.mjs:
 * en prod (CF Workers) _portal llama `env.AUTH.verifySession(cookie)` y
 * `env.AUTH.getTenantInfo({cookie})` / `getInstalledApps({cookie})` via
 * CF Service Binding — RPCs internos con latencia ~0, costo $0.
 *
 * En dev local no hay Service Binding: el `_auth` de dev corre con
 * `wrangler dev` en :3031. El middleware de Astro (`src/middleware.ts`)
 * monta este mock en `globalThis.__SIVO_DEV_AUTH__` y pega contra los HTTP
 * wrappers de _auth (`/api/auth/verify`, `/api/auth/broker/*`).
 *
 * Cero lógica HMAC ni decrypt duplicada — la verificación real + queries
 * viven en `_auth/backend/nodes/auth/sign-session.js` y
 * `_auth/backend/nodes/auth/auth-broker-rpc.js`.
 *
 * Activado solo en dev: `src/middleware.ts` lo monta cuando falta
 * `env.AUTH` y (dev o `DEV_AUTH_FAKE=1`). En prod el binding existe y nunca
 * se monta.
 */

// AUTH_BASE gana sobre AUTH_PORT; si no, el default http://localhost:3031.
const DEFAULT_BASE =
  process.env.AUTH_BASE ||
  (process.env.AUTH_PORT ? `http://localhost:${process.env.AUTH_PORT}` : 'http://localhost:3031')

let cached = null

export function getFakeAuthBinding() {
  if (cached) return cached
  cached = createFakeAuthBinding({ baseUrl: DEFAULT_BASE })
  return cached
}

export function createFakeAuthBinding({ baseUrl } = {}) {
  const url = baseUrl || DEFAULT_BASE
  return {
    async verifySession(cookieValue) {
      if (!cookieValue || typeof cookieValue !== 'string') {
        return { valid: false, reason: 'missing' }
      }
      try {
        const res = await fetch(`${url}/api/auth/verify`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cookie: cookieValue }),
        })
        if (!res.ok) return { valid: false, reason: `rpc_http_${res.status}` }
        const json = await res.json()
        return json.data || { valid: false, reason: 'rpc_bad_shape' }
      } catch (err) {
        return { valid: false, reason: `rpc_error: ${err.message}` }
      }
    },

    async getTenantInfo({ cookie } = {}) {
      if (!cookie || typeof cookie !== 'string') {
        return { valid: false }
      }
      try {
        const res = await fetch(`${url}/api/auth/broker/tenant-info`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cookie }),
        })
        if (!res.ok) return { valid: false }
        const json = await res.json()
        return json.data || { valid: false }
      } catch (err) {
        return { valid: false, reason: `rpc_error: ${err.message}` }
      }
    },

    async getInstalledApps({ cookie } = {}) {
      if (!cookie || typeof cookie !== 'string') {
        return { valid: false }
      }
      try {
        const res = await fetch(`${url}/api/auth/broker/installed-apps`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cookie }),
        })
        if (!res.ok) return { valid: false }
        const json = await res.json()
        return json.data || { valid: false }
      } catch (err) {
        return { valid: false, reason: `rpc_error: ${err.message}` }
      }
    },

    // ─── Billing (mismo dispatch /api/auth/broker/billing por action) ──────
    getSubscription({ cookie } = {}) {
      return callBilling(url, 'getSubscription', { cookie })
    },
    getUsageSummary({ cookie, from, to } = {}) {
      return callBilling(url, 'getUsageSummary', { cookie, from, to })
    },
    getInvoices({ cookie, limit } = {}) {
      return callBilling(url, 'getInvoices', { cookie, limit })
    },
    setSupportPlan({ cookie, planCode } = {}) {
      return callBilling(url, 'setSupportPlan', { cookie, planCode })
    },
    setAutoRenew({ cookie, enabled } = {}) {
      return callBilling(url, 'setAutoRenew', { cookie, enabled })
    },

    // ─── Billing Paddle (checkout / wallet / portal) ───────────────────────
    getPaddleClientConfig({ cookie } = {}) {
      return callBilling(url, 'getPaddleClientConfig', { cookie })
    },
    createCheckout({ cookie, subscriptionId, priceIds } = {}) {
      return callBilling(url, 'createCheckout', { cookie, subscriptionId, priceIds })
    },
    createWalletTopup({ cookie, amountCents, currency, description, serviceCode } = {}) {
      return callBilling(url, 'createWalletTopup', { cookie, amountCents, currency, description, serviceCode })
    },
    createPortalSession({ cookie } = {}) {
      return callBilling(url, 'createPortalSession', { cookie })
    },

    // ─── Apps (mismo dispatch /api/auth/broker/apps por action) ────────────
    listCatalog({ cookie } = {}) {
      return callApps(url, 'listCatalog', { cookie })
    },
    uninstallApp({ cookie, appSlug } = {}) {
      return callApps(url, 'uninstallApp', { cookie, appSlug })
    },
    reactivateApp({ cookie, appSlug } = {}) {
      return callApps(url, 'reactivateApp', { cookie, appSlug })
    },
  }
}

async function callBilling(url, action, payload) {
  if (!payload.cookie || typeof payload.cookie !== 'string') {
    return { valid: false }
  }
  try {
    const res = await fetch(`${url}/api/auth/broker/billing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    if (!res.ok) return { valid: false }
    const json = await res.json()
    return json.data || { valid: false }
  } catch (err) {
    return { valid: false, reason: `rpc_error: ${err.message}` }
  }
}

async function callApps(url, action, payload) {
  if (!payload.cookie || typeof payload.cookie !== 'string') {
    return { valid: false }
  }
  try {
    const res = await fetch(`${url}/api/auth/broker/apps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    })
    if (!res.ok) return { valid: false }
    const json = await res.json()
    return json.data || { valid: false }
  } catch (err) {
    return { valid: false, reason: `rpc_error: ${err.message}` }
  }
}

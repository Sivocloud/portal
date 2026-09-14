/**
 * backend/src/dev/fake-auth-binding.mjs — Dev-only mock de `env.AUTH`
 * (Service Binding RPC).
 *
 * Mismo patrón que apps/sivo-pos/backend/src/dev/fake-auth-binding.mjs:
 * en prod (CF Workers) _portal llama `env.AUTH.verifySession(cookie)` y
 * `env.AUTH.getTenantInfo({cookie})` / `getInstalledApps({cookie})` via
 * CF Service Binding — RPCs internos con latencia ~0, costo $0.
 *
 * En local (`bun server.js` con Node) los Service Bindings no existen:
 * `c.env.AUTH` es undefined. Acá proveemos un mock que pega contra
 * _auth's HTTP wrappers (`/api/auth/verify`, `/api/auth/broker/info`).
 *
 * Cero lógica HMAC ni decrypt duplicada — la verificación real + queries
 * viven en `_auth/backend/nodes/auth/sign-session.js` y
 * `_auth/backend/nodes/auth/auth-broker-rpc.js`.
 *
 * Activado solo en dev: `app.js` lo monta cuando
 * `isDev() && !c.env.AUTH`. En CF Workers `isDev()` es false.
 */

const DEFAULT_BASE = process.env.AUTH_PORT
  ? `http://localhost:${process.env.AUTH_PORT}`
  : 'http://localhost:3031'

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
  }
}

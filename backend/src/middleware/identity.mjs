/**
 * backend/src/middleware/identity.mjs — Resolución de identidad de _portal,
 * AGNÓSTICA del host.
 *
 * Vivía embebida en `attach-auth-claims.js` (middleware de Hono). Con la UI en
 * Astro, el perímetro pasó a `src/middleware.ts`, así que se extrajo la lógica
 * para que no dependa de Hono: recibe headers + env y devuelve un resultado
 * discriminado; el caller traduce (302 al login / 401 JSON / locals).
 *
 * Diferencias con sivo-pos:
 *   - _portal NO abre DB del tenant: solo verifica la sesión. La metadata
 *     (tenant, apps, billing) se pide on-demand al broker en cada flow.
 *
 * ZERO secrets de plataforma. Solo `env.AUTH` (Service Binding RPC).
 */

const COOKIE_NAME_PRIMARY = '__Secure-sivocloud_session'
const COOKIE_NAME_DEV = 'sivocloud_session'
const DEV_CLAIMS_HEADER = 'x-dev-claims'

export function readSessionCookie(cookieHeader) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(/;\s*/)
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === COOKIE_NAME_PRIMARY || k === COOKIE_NAME_DEV) {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

export function isPublicPath(pathname, publicPaths = []) {
  for (const p of publicPaths) {
    if (pathname === p) return true
    if (p.endsWith('/') && pathname.startsWith(p)) return true
    if (pathname.startsWith(p + '/')) return true
  }
  return false
}

function isDev() {
  try { if (import.meta.env && import.meta.env.DEV === true) return true } catch { /* sin vite */ }
  return (process.env?.NODE_ENV || 'development') !== 'production'
}

/**
 * Devuelve el worker de _auth (`env.AUTH`) o, en dev sin Service Binding, el
 * fake HTTP que `src/middleware.ts` publica en `globalThis.__SIVO_DEV_AUTH__`
 * (misma signature → paridad local↔prod). Se lee por global para no importar
 * el fake desde acá (un `import()` literal terminaría bundleado en prod).
 */
function resolveAuthWorker(env, rpcBinding) {
  return env?.[rpcBinding] || globalThis.__SIVO_DEV_AUTH__ || undefined
}

/**
 * Resultado discriminado:
 *   - `{ kind: 'ok', claims, user, tenantId }`
 *   - `{ kind: 'error', status, body }`
 *
 * @param {{ headers: Headers, env: any, rpcBinding?: string }} [opts]
 */
export async function resolveIdentity({ headers, env, rpcBinding = 'AUTH' } = {}) {
  const cookieHeader = headers.get('cookie') || ''
  const cookieValue = readSessionCookie(cookieHeader)

  let claims = null

  if (isDev()) {
    const devHeader = headers.get(DEV_CLAIMS_HEADER)
    if (devHeader) {
      try {
        const json = JSON.parse(Buffer.from(devHeader, 'base64').toString('utf8'))
        if (json && json.sub && json.tenant) claims = json
      } catch { /* header inválido */ }
    }
  }

  if (!claims && cookieValue) {
    const authWorker = resolveAuthWorker(env, rpcBinding)
    if (authWorker && typeof authWorker.verifySession === 'function') {
      try {
        const result = await authWorker.verifySession(cookieValue)
        if (result && result.valid && result.claims) claims = result.claims
      } catch { /* RPC falló */ }
    }
  }

  if (!claims) {
    return { kind: 'error', status: 401, body: { error: 'No session', hint: 'login required' } }
  }

  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
    return { kind: 'error', status: 401, body: { error: 'Session expired' } }
  }

  return {
    kind: 'ok',
    claims,
    user: { id: claims.sub, role: claims.role },
    tenantId: claims.tenant,
  }
}

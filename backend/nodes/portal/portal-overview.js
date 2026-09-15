/**
 * portal-overview.js — Custom node: agregado del dashboard del portal.
 *
 * Hace DOS RPCs al broker de `_auth` (Service Binding `env.AUTH`) y combina
 * el resultado en un solo payload para la vista server-rendered:
 *   - `getTenantInfo({ cookie })`   → { valid, tenant }
 *   - `getInstalledApps({ cookie })` → { valid, apps }
 *
 * El cookie viaja en `ctx.env.cookieHeader` / `ctx.env.requestHeaders`
 * (inyectado por `app.js` al forwardear a flow-engine).
 *
 * @table none (no SQL — solo RPC `env.AUTH`)
 */
export default {
  type: 'portal-overview',
  name: 'Portal: Overview (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookieHeader = ctx?.env?.cookieHeader
      || (ctx?.env?.requestHeaders?.get?.('cookie'))
      || (ctx?.env?.requestHeaders?.cookie || '')
    const cookieValue = readSessionCookie(cookieHeader)
    const authWorker = ctx.env?.AUTH

    if (!cookieValue || !authWorker || typeof authWorker.getTenantInfo !== 'function') {
      return [{ ...msg, payload: { data: { valid: false, reason: 'missing_input' } } }]
    }

    let info
    let installed
    try {
      info = await authWorker.getTenantInfo({ cookie: cookieValue })
      installed = typeof authWorker.getInstalledApps === 'function'
        ? await authWorker.getInstalledApps({ cookie: cookieValue })
        : { valid: true, apps: [] }
    } catch (err) {
      console.warn(`[portal-overview] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { valid: false, reason: 'rpc_error' } } }]
    }

    if (!info || !info.valid) {
      return [{ ...msg, payload: { data: { valid: false, reason: 'invalid' } } }]
    }

    const claims = ctx.env?.authClaims
    return [{
      ...msg,
      payload: {
        data: {
          valid: true,
          user: claims ? { id: claims.sub, role: claims.role } : null,
          tenant: info.tenant || null,
          apps: (installed && installed.valid && Array.isArray(installed.apps)) ? installed.apps : [],
        },
      },
    }]
  },
}

function readSessionCookie(cookieHeader) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(/;\s*/)
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === '__Secure-sivocloud_session' || k === 'sivocloud_session') {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

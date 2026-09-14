/**
 * backend/nodes/auth/portal-apps.js — Custom node: lista apps instaladas
 * del tenant activo.
 *
 * Lee el cookie de `ctx.env.requestHeaders.cookie`. Llama
 * `env.AUTH.getInstalledApps({cookie})` via RPC.
 *
 * ⚠️ El RPC devuelve apps SIN credenciales (solo metadata pública).
 *
 * @table none (no SQL — usa RPC `env.AUTH.getInstalledApps`)
 */
export default {
  type: 'portal-apps',
  name: 'Portal: Installed Apps (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 2,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookieHeader = ctx?.env?.cookieHeader
      || (ctx?.env?.requestHeaders?.get?.('cookie'))
      || (ctx?.env?.requestHeaders?.cookie || '')
    const cookieValue = readSessionCookie(cookieHeader)
    const authWorker = ctx.env?.AUTH
    if (!cookieValue || !authWorker || typeof authWorker.getInstalledApps !== 'function') {
      return [{ ...msg, payload: { data: { valid: false, reason: 'missing_input' } } }, null]
    }
    let result
    try {
      result = await authWorker.getInstalledApps({ cookie: cookieValue })
    } catch (err) {
      console.warn(`[portal-apps] getInstalledApps RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { valid: false, reason: 'rpc_error' } } }, null]
    }
    if (!result || !result.valid) {
      return [{ ...msg, payload: { data: { valid: false, reason: 'invalid' } } }, null]
    }
    return [{
      ...msg,
      payload: {
        data: {
          valid: true,
          apps: result.apps || [],
        },
      },
    }, null]
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

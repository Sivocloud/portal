/**
 * backend/nodes/auth/portal-me.js — Custom node: devuelve metadata del
 * user + tenant para el portal.
 *
 * Lee el cookie de `ctx.env.requestHeaders.cookie` (provisto por
 * flow-engine al cargar el request HTTP). Llama
 * `env.AUTH.getTenantInfo({cookie})` via RPC.
 *
 * @table none (no SQL — usa RPC `env.AUTH.getTenantInfo`)
 */
export default {
  type: 'portal-me',
  name: 'Portal: Me (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 2, // 0 = ok, 1 = invalid cookie
  defaults: {},
  async execute(node, msg, ctx) {
    const cookieHeader = ctx?.env?.cookieHeader
      || (ctx?.env?.requestHeaders?.get?.('cookie'))
      || (ctx?.env?.requestHeaders?.cookie || '')
    const cookieValue = readSessionCookie(cookieHeader)
    const authWorker = ctx.env?.AUTH
    if (!cookieValue || !authWorker || typeof authWorker.getTenantInfo !== 'function') {
      return [{ ...msg, payload: { data: { valid: false, reason: 'missing_input' } } }, null]
    }
    let result
    try {
      result = await authWorker.getTenantInfo({ cookie: cookieValue })
    } catch (err) {
      console.warn(`[portal-me] getTenantInfo RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { valid: false, reason: 'rpc_error' } } }, null]
    }
    if (!result || !result.valid) {
      return [{ ...msg, payload: { data: { valid: false, reason: 'invalid' } } }, null]
    }
    const claims = ctx.env?.authClaims
    const user = claims ? { id: claims.sub, role: claims.role } : null
    return [{
      ...msg,
      payload: {
        data: {
          valid: true,
          user,
          tenant: result.tenant,
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

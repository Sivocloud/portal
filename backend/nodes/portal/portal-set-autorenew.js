/**
 * portal-set-autorenew.js — Custom node: activa/desactiva la auto-renovación.
 *
 * RPC `env.AUTH.setAutoRenew({ cookie, enabled })`.
 * `enabled` viene por query string: `?enabled=false`.
 *
 * @table none (RPC `env.AUTH`)
 */
export default {
  type: 'portal-set-autorenew',
  name: 'Portal: Set Auto-Renew (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookie = readSessionCookie(ctx?.env?.cookieHeader
      || ctx?.env?.requestHeaders?.get?.('cookie')
      || ctx?.env?.requestHeaders?.cookie || '')
    const auth = ctx.env?.AUTH
    if (!cookie || !auth || typeof auth.setAutoRenew !== 'function') {
      return [{ ...msg, payload: { data: { ok: false, reason: 'missing_input' } } }]
    }

    const enabled = String(msg.payload?.enabled ?? 'true') !== 'false'

    let result
    try {
      result = await auth.setAutoRenew({ cookie, enabled })
    } catch (err) {
      console.warn(`[portal-set-autorenew] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { ok: false, reason: 'rpc_error' } } }]
    }

    return [{
      ...msg,
      payload: {
        ...msg.payload,
        data: {
          ok: result?.valid === true,
          toast: result?.valid === true
            ? { type: 'success', message: enabled ? 'Auto-renovación activada.' : 'Auto-renovación desactivada.' }
            : { type: 'error', message: 'No se pudo actualizar la auto-renovación.' },
        },
      },
    }]
  },
}

function readSessionCookie(cookieHeader) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === '__Secure-sivocloud_session' || k === 'sivocloud_session') {
      return decodeURIComponent(part.slice(eq + 1).trim())
    }
  }
  return null
}

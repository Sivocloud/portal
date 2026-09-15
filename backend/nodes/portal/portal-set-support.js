/**
 * portal-set-support.js — Custom node: cambia el plan de soporte del tenant.
 *
 * RPC `env.AUTH.setSupportPlan({ cookie, planCode })`.
 * `planCode` viene por query string: `?planCode=premium` (o vacío = sin soporte).
 *
 * @table none (RPC `env.AUTH`)
 */
export default {
  type: 'portal-set-support',
  name: 'Portal: Set Support Plan (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookie = readSessionCookie(ctx?.env?.cookieHeader
      || ctx?.env?.requestHeaders?.get?.('cookie')
      || ctx?.env?.requestHeaders?.cookie || '')
    const auth = ctx.env?.AUTH
    if (!cookie || !auth || typeof auth.setSupportPlan !== 'function') {
      return [{ ...msg, payload: { data: { ok: false, reason: 'missing_input' } } }]
    }

    const raw = msg.payload?.planCode
    const planCode = raw === undefined || raw === '' || raw === 'none' ? null : String(raw)

    let result
    try {
      result = await auth.setSupportPlan({ cookie, planCode })
    } catch (err) {
      console.warn(`[portal-set-support] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { ok: false, reason: 'rpc_error' } } }]
    }

    return [{
      ...msg,
      payload: {
        ...msg.payload,
        data: {
          ok: result?.valid === true,
          toast: result?.valid === true
            ? { type: 'success', message: planCode ? `Soporte ${planCode} activado.` : 'Soporte desactivado.' }
            : { type: 'error', message: 'No se pudo actualizar el soporte.' },
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

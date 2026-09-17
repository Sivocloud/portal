/**
 * portal-paddle-portal.js — Custom node: sesión del Customer Portal de Paddle.
 *
 * RPC `env.AUTH.createPortalSession({ cookie })` → URLs autenticadas para que
 * el tenant gestione su suscripción (método de pago, cancelar, cambiar) en el
 * portal hosted de Paddle.
 *
 * Devuelve JSON para la isla `paddle`: `{ ok, url }`.
 *
 * @table none (RPC `env.AUTH`)
 */
export default {
  type: 'portal-paddle-portal',
  name: 'Portal: Paddle Customer Portal (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookie = readSessionCookie(ctx?.env?.cookieHeader
      || ctx?.env?.requestHeaders?.get?.('cookie')
      || ctx?.env?.requestHeaders?.cookie || '')
    const auth = ctx.env?.AUTH
    if (!cookie || !auth || typeof auth.createPortalSession !== 'function') {
      return [{ ...msg, payload: { ok: false, reason: 'missing_input' } }]
    }

    try {
      const r = await auth.createPortalSession({ cookie })
      // Paddle devuelve urls.general.overview (string) y urls.subscriptions
      // (array de deep-links por suscripción). Preferimos el overview.
      const overview = r?.overviewUrl || r?.urls?.general?.overview || null
      const subUrl = typeof r?.subscriptionsUrl === 'string' ? r.subscriptionsUrl : null
      return [{ ...msg, payload: {
        ok: r?.ok === true,
        url: overview || subUrl,
        reason: r?.ok === true ? null : (r?.reason || 'unknown'),
      } }]
    } catch (err) {
      console.warn(`[portal-paddle-portal] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { ok: false, reason: 'rpc_error' } }]
    }
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

/**
 * portal-paddle-checkout.js — Custom node: crea un checkout de Paddle.
 *
 * RPC `env.AUTH.createCheckout` (suscripción) o `env.AUTH.createWalletTopup`
 * (pago único / wallet). El portal NO tiene secrets de Paddle: la transacción
 * la crea `_controlplane` vía `_auth`.
 *
 * Devuelve JSON para la isla `paddle`:
 *   { ok, transactionId, checkoutUrl, clientConfig }
 *
 * @table none (RPC `env.AUTH`)
 */
export default {
  type: 'portal-paddle-checkout',
  name: 'Portal: Paddle Checkout (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookie = readSessionCookie(ctx?.env?.cookieHeader
      || ctx?.env?.requestHeaders?.get?.('cookie')
      || ctx?.env?.requestHeaders?.cookie || '')
    const auth = ctx.env?.AUTH
    if (!cookie || !auth) {
      return [json(msg, { ok: false, reason: 'missing_input' })]
    }

    const p = msg.payload || {}
    const kind = String(p.kind || 'subscription')

    try {
      if (kind === 'wallet') {
        if (typeof auth.createWalletTopup !== 'function') {
          return [json(msg, { ok: false, reason: 'rpc_unavailable' })]
        }
        const r = await auth.createWalletTopup({
          cookie,
          amountCents: Number(p.amountCents) || 0,
          currency: p.currency || 'USD',
          description: p.description || 'Saldo prepago SIVOCLOUD',
          serviceCode: p.serviceCode || null,
        })
        return [json(msg, r)]
      }

      if (typeof auth.createCheckout !== 'function') {
        return [json(msg, { ok: false, reason: 'rpc_unavailable' })]
      }
      const r = await auth.createCheckout({
        cookie,
        subscriptionId: p.subscriptionId || null,
        priceIds: Array.isArray(p.priceIds) ? p.priceIds : undefined,
      })
      return [json(msg, r)]
    } catch (err) {
      console.warn(`[portal-paddle-checkout] RPC failed: ${err.message}`)
      return [json(msg, { ok: false, reason: 'rpc_error' })]
    }
  },
}

function json(msg, data) {
  return { ...msg, payload: data }
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

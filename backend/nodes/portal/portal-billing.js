/**
 * portal-billing.js — Custom node: agregado de la sección Facturación.
 *
 * Hace TRES RPCs al broker de `_auth` (Service Binding `env.AUTH`) y combina:
 *   - getSubscription({ cookie })   → plan de soporte, apps facturadas, estimado
 *   - getUsageSummary({ cookie })   → consumo del período + franquicia
 *   - getInvoices({ cookie })       → facturas emitidas
 *
 * El cookie viaja en `ctx.env.cookieHeader` (lo setea app.js al forwardear).
 *
 * @table none (no SQL — solo RPC `env.AUTH`)
 */
export default {
  type: 'portal-billing',
  name: 'Portal: Billing (RPC)',
  category: 'portal',
  inputs: 1,
  outputs: 1,
  defaults: {},
  async execute(node, msg, ctx) {
    const cookieHeader = ctx?.env?.cookieHeader
      || (ctx?.env?.requestHeaders?.get?.('cookie'))
      || (ctx?.env?.requestHeaders?.cookie || '')
    const cookie = readSessionCookie(cookieHeader)
    const auth = ctx.env?.AUTH

    if (!cookie || !auth || typeof auth.getSubscription !== 'function') {
      return [{ ...msg, payload: { data: { valid: false, reason: 'missing_input' } } }]
    }

    let subscription
    let usage
    let invoices
    try {
      subscription = await auth.getSubscription({ cookie })
      usage = typeof auth.getUsageSummary === 'function'
        ? await auth.getUsageSummary({ cookie })
        : { valid: true, lines: [], period: {}, totals: {} }
      invoices = typeof auth.getInvoices === 'function'
        ? await auth.getInvoices({ cookie })
        : { valid: true, invoices: [] }
    } catch (err) {
      console.warn(`[portal-billing] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { valid: false, reason: 'rpc_error' } } }]
    }

    if (!subscription || subscription.valid === false) {
      return [{ ...msg, payload: { data: {
        valid: false,
        reason: subscription?.reason || 'invalid',
      } } }]
    }

    const role = ctx.env?.USER_ROLE || ctx.env?.authClaims?.role || ''

    return [{
      ...msg,
      payload: {
        data: {
          valid: true,
          // Preserva el toast de un write previo (set-support / set-autorenew).
          toast: msg.payload?.data?.toast || null,
          canManage: ['super_admin', 'owner'].includes(role),
          role,
          subscription: subscription.subscription,
          items: subscription.items || [],
          estimate: subscription.estimate || {},
          usage: {
            period: usage?.period || {},
            lines: usage?.lines || [],
            totals: usage?.totals || {},
          },
          invoices: invoices?.invoices || [],
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

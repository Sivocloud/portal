/**
 * portal-app-toggle.js — Custom node: desinstala/reactiva una app del tenant.
 *
 * RPC `env.AUTH.uninstallApp({ cookie, appSlug })` o
 * `env.AUTH.reactivateApp({ cookie, appSlug })` según `?action=`.
 * `appSlug` viene por query string: `?action=uninstall&appSlug=pos`.
 *
 * @table none (RPC `env.AUTH`)
 */
export default {
  type: 'portal-app-toggle',
  name: 'Portal: Toggle App (RPC)',
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
      return [{ ...msg, payload: { data: { ok: false, reason: 'missing_input' } } }]
    }

    const action = String(msg.payload?.action || '').trim()
    const appSlug = String(msg.payload?.appSlug || '').trim()
    const fn = action === 'reactivate' ? auth.reactivateApp : auth.uninstallApp
    if (!appSlug || typeof fn !== 'function') {
      return [{ ...msg, payload: { data: { ok: false, reason: 'invalid_input' } } }]
    }

    let result
    try {
      result = await fn({ cookie, appSlug })
    } catch (err) {
      console.warn(`[portal-app-toggle] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { ok: false, reason: 'rpc_error' } } }]
    }

    const ok = result?.valid === true
    const message = ok
      ? (action === 'reactivate'
        ? `App "${appSlug}" reactivada.`
        : `App "${appSlug}" desinstalada. Podés reinstalarla dentro de la ventana de retención.`)
      : `No se pudo ${action === 'reactivate' ? 'reactivar' : 'desinstalar'} la app.`

    return [{
      ...msg,
      payload: {
        ...msg.payload,
        data: { ok, toast: { type: ok ? 'success' : 'error', message } },
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

/**
 * portal-apps-catalog.js — Custom node: agregado de la sección Aplicaciones.
 *
 * Hace DOS RPCs al broker de `_auth` (Service Binding `env.AUTH`) y combina:
 *   - listCatalog({ cookie })       → catálogo de apps instalables + precio
 *   - getInstalledApps({ cookie })  → apps del tenant (status, ventana de purga)
 *
 * El cookie viaja en `ctx.env.cookieHeader` (lo setea `feEnv` en `src/lib/server/flows.ts`).
 *
 * @table none (no SQL — solo RPC `env.AUTH`)
 */
export default {
  type: 'portal-apps-catalog',
  name: 'Portal: Apps (RPC)',
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

    if (!cookie || !auth || typeof auth.listCatalog !== 'function') {
      return [{ ...msg, payload: { data: { valid: false, reason: 'missing_input' } } }]
    }

    let catalog
    let installed
    try {
      catalog = await auth.listCatalog({ cookie })
      installed = typeof auth.getInstalledApps === 'function'
        ? await auth.getInstalledApps({ cookie })
        : { valid: true, apps: [] }
    } catch (err) {
      console.warn(`[portal-apps-catalog] RPC failed: ${err.message}`)
      return [{ ...msg, payload: { data: { valid: false, reason: 'rpc_error' } } }]
    }

    if (!catalog || catalog.valid === false) {
      return [{ ...msg, payload: { data: { valid: false, reason: catalog?.reason || 'invalid' } } }]
    }

    const role = ctx.env?.USER_ROLE || ctx.env?.authClaims?.role || ''

    return [{
      ...msg,
      payload: {
        data: {
          valid: true,
          // Preserva el toast de un write previo (toggle).
          toast: msg.payload?.data?.toast || null,
          canManage: ['super_admin', 'owner'].includes(role),
          role,
          catalog: catalog.apps || [],
          installed: installed?.apps || [],
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

/**
 * src/middleware.ts — perímetro de identidad del portal (uno solo).
 *
 * Reemplaza al middleware de Hono (`attach-auth-claims.js`) ahora que la UI y
 * los endpoints son de Astro. Una request = una resolución de identidad:
 *
 *   1. Publica los bindings del worker en `globalThis.SIVO_ENV` (el backend
 *      lee el env por ahí — `backend/src/lib/env.mjs`).
 *   2. Dev sin Service Binding real: inyecta el fake HTTP contra `_auth` :3031
 *      (`globalThis.__SIVO_DEV_AUTH__`). Conserva el loop local
 *      portal → _auth → _controlplane para probar Paddle.
 *   3. Resuelve la sesión (`env.AUTH.verifySession`) vía `resolveIdentity`.
 *   4. Traduce el resultado: browser (Accept: text/html) → 302 al login con
 *      `return_to`; cliente API → 401 JSON.
 *   5. POST/Redirect/GET + flash de las Actions (cookie de un solo uso), así el
 *      refresh no reenvía el POST y el aviso sobrevive al redirect.
 *   6. Caché del browser para las páginas (`private, max-age=30` + `Vary:
 *      Cookie`): habilita el prefetch de Astro sin filtrar datos entre sesiones.
 *
 * La CSP NO se setea acá: la aplica Astro (`security.csp` en
 * `astro.config.mjs`), que además hashea los `<script>`/`<style>` inline que
 * inyecta su runtime.
 */
import { defineMiddleware } from 'astro:middleware'
import { getActionContext } from 'astro:actions'
import { env } from 'cloudflare:workers'
import { resolveIdentity, isPublicPath } from './server/identity.mjs'
import { getEnv } from './server/lib/env.mjs'
import { PUBLIC_PATHS } from './server/lib/page-feeds'

/** Cookie de un solo uso con el resultado de la última Action (flash del PRG). */
const FLASH_COOKIE = 'sivo_portal_action'

/** `private, max-age=30` para las páginas HTML. */
const PAGE_CACHE = 'private, max-age=30'

const isDev = () => getEnv().NODE_ENV !== 'production'

/**
 * Caché del browser para las PÁGINAS (no para el API ni los assets).
 *
 * - `private`: el mismo browser la reusa (prefetch/Back), ninguna caché
 *   compartida/CDN la guarda. En Workers Cache, `private` = BYPASS.
 * - `Vary: Cookie` **no es opcional**: sin él la caché privada (indexada por
 *   URL) serviría la página de otra sesión.
 * - Solo 200 HTML: los 302/403 no se cachean.
 */
function withPageCache(res: Response): Response {
  if (res.status !== 200) return res
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res

  const headers = new Headers(res.headers)
  headers.set('cache-control', PAGE_CACHE)

  const vary = new Set(
    (headers.get('vary') || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  )
  vary.add('Cookie')
  headers.set('vary', [...vary].join(', '))

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export const onRequest = defineMiddleware(async (context, next) => {
  const bindings: any = env
  globalThis.SIVO_ENV = bindings

  // Dev: el `_auth` local corre por HTTP en :3031 (no hay Service Binding).
  // `DEV_AUTH_FAKE=1` lo habilita también en un build local servido por
  // `astro preview`/`wrangler dev` (ahí `import.meta.env.DEV` es false).
  // En prod el binding existe → nunca se monta.
  if (!bindings.AUTH && (import.meta.env.DEV || bindings.DEV_AUTH_FAKE === '1') && !globalThis.__SIVO_DEV_AUTH__) {
    const { createFakeAuthBinding } = await import('./server/dev/fake-auth-binding.mjs')
    const envVars = getEnv()
    const baseUrl = envVars.AUTH_BASE || `http://localhost:${envVars.AUTH_PORT || 3031}`
    globalThis.__SIVO_DEV_AUTH__ = createFakeAuthBinding({ baseUrl })
  }

  const { pathname } = context.url
  if (isPublicPath(pathname, PUBLIC_PATHS)) return next()

  const identity: any = await resolveIdentity({ headers: context.request.headers, env: bindings })

  if (identity.kind === 'error') {
    const accept = context.request.headers.get('accept') || ''
    if (accept.includes('text/html')) {
      const authBase = getEnv().AUTH_BASE || 'https://auth.sivocloud.dev'
      const login = `${authBase}/login?return_to=${encodeURIComponent(context.request.url)}`
      return new Response(null, { status: 302, headers: { Location: login } })
    }
    return new Response(JSON.stringify(identity.body), {
      status: identity.status,
      headers: { 'content-type': 'application/json' },
    })
  }

  context.locals.identity = { claims: identity.claims, user: identity.user }

  // ── Actions: POST/Redirect/GET + flash ────────────────────────────────────
  // El resultado de una Action que vino de un `<form>` se guarda en una cookie
  // de un solo uso y se redirige: el refresh no reenvía el POST y el aviso
  // sobrevive al redirect (mismo patrón que sivo-pos, sin KV: el portal sigue
  // con cero bindings). El request siguiente lo restaura en
  // `Astro.getActionResult()`.
  const { action, setActionResult, serializeActionResult } = getActionContext(context)

  const payload = context.cookies.get(FLASH_COOKIE)?.value
  if (payload) {
    try {
      const { actionName, actionResult } = JSON.parse(payload)
      setActionResult(actionName, actionResult)
    } catch {
      // Cookie corrupta: se ignora y se limpia igual.
    }
    context.cookies.delete(FLASH_COOKIE, { path: '/' })
  }

  if (action?.calledFrom === 'form') {
    const result = await action.handler()
    context.cookies.set(FLASH_COOKIE, JSON.stringify({
      actionName: action.name,
      actionResult: serializeActionResult(result),
    }), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: !isDev(),
      maxAge: 60,
    })
    // `originPathname` viene con trailing slash (`/facturacion/`); la URL
    // canónica no lo lleva (así la matchea `page-feeds`).
    const back = context.originPathname.replace(/\/+$/, '') || '/'
    return context.redirect(back)
  }

  return withPageCache(await next())
})

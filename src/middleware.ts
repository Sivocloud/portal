/**
 * src/middleware.ts — perímetro de identidad del portal.
 *
 * Reemplaza al middleware de Hono (`attach-auth-claims.js`) ahora que la UI y
 * los endpoints son de Astro:
 *
 *   1. Publica los bindings del worker en `globalThis.SIVO_ENV` (el backend
 *      lee el env por ahí — `backend/src/lib/env.mjs`).
 *   2. Dev sin Service Binding real: inyecta el fake HTTP contra `_auth` :3031
 *      (`globalThis.__SIVO_DEV_AUTH__`). Conserva el loop local
 *      portal → _auth → _controlplane para probar Paddle.
 *   3. Resuelve la sesión (`env.AUTH.verifySession`) vía `resolveIdentity`.
 *   4. Traduce el resultado: browser (Accept: text/html) → 302 al login con
 *      `return_to`; cliente API → 401 JSON.
 *
 * La CSP NO se setea acá: la aplica Astro (`security.csp` en
 * `astro.config.mjs`), que además hashea los `<script>`/`<style>` inline que
 * inyecta su runtime.
 */
import { defineMiddleware } from 'astro:middleware'
import { env } from 'cloudflare:workers'
import { resolveIdentity, isPublicPath } from '../backend/src/middleware/identity.mjs'
import { getEnv } from '../backend/src/lib/env.mjs'

// Paths sin sesión: health. Los assets (`/theme.js`, `/_astro/*`) los sirve el
// adapter antes de llegar acá, así que no necesitan entrada.
const PUBLIC_PATHS = ['/health', '/api/health']

export const onRequest = defineMiddleware(async (context, next) => {
  const bindings: any = env
  globalThis.SIVO_ENV = bindings

  // Dev: el `_auth` local corre por HTTP en :3031 (no hay Service Binding).
  // `DEV_AUTH_FAKE=1` lo habilita también en un build local servido por
  // `astro preview`/`wrangler dev` (ahí `import.meta.env.DEV` es false).
  // En prod el binding existe → nunca se monta.
  if (!bindings.AUTH && (import.meta.env.DEV || bindings.DEV_AUTH_FAKE === '1') && !globalThis.__SIVO_DEV_AUTH__) {
    const { createFakeAuthBinding } = await import('../backend/src/dev/fake-auth-binding.mjs')
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
  return next()
})

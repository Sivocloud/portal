/**
 * backend/app.js — Hono app para _portal (server-rendered, HTMX).
 *
 * El portal es un servicio de plataforma en su PROPIO subdominio
 * (`panel.sivocloud.dev/*` en prod, `localhost:3034/*` en dev), así que los
 * paths llegan limpios (sin prefijo de app). Hono sirve:
 *   - Páginas HTML y fragmentos HTMX en la raíz → se reescriben a
 *     `/api/_ui/*` y se delegan a flow-engine (flow `ui.portal` + nodo
 *     `ui.html-response`). El dashboard vive en `/`.
 *   - Assets estáticos `/static/*` (CSS, htmx, islands) — servidos por Hono.
 *   - La API JSON `/api/*` (flows `portal-me` / `portal-apps`).
 *
 * Hono sigue haciendo SOLO el perímetro: CORS, auth (attachAuthClaims) y
 * forward a flow-engine. ZERO secrets de plataforma: solo `env.AUTH`.
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { getEnv, getAuthBase, getAppsBase } from './src/lib/env.mjs'
import { fe } from './fe.mjs'
import { attachAuthClaims } from './src/middleware/attach-auth-claims.js'
import { serveUiStatic } from './src/ui/static.js'

const isDev = getEnv().NODE_ENV !== 'production'

export const app = new Hono()

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*'
    if (origin.endsWith('.sivocloud.dev')) return origin
    if (origin === 'https://sivocloud.dev') return origin
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin
    return '*'
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'HX-Request', 'HX-Target', 'HX-Current-URL'],
  exposeHeaders: ['HX-Redirect'],
}))

if (isDev) app.use('*', logger())

// Rutas públicas (sin sesión): health + assets estáticos.
const PUBLIC_PATHS = new Set(['/health', '/api/health', '/static'])

const authMiddleware = attachAuthClaims({
  rpcBinding: 'AUTH',
  publicPaths: PUBLIC_PATHS,
  skipTenantDb: true,
})

app.use('*', authMiddleware)

// ── Health ────────────────────────────────────────────────────────────────
app.get('/health', (c) => c.json({
  status: 'ok',
  app: 'sivocloud-portal',
  zeroSecrets: true,
}))

// ── Assets estáticos de la UI ─────────────────────────────────────────────
app.get('/static/*', (c) => {
  const rel = c.req.path.slice('/static'.length)
  const res = serveUiStatic(rel)
  return res || c.text('Asset no encontrado', 404)
})

// ── Forward a flow-engine ─────────────────────────────────────────────────
function buildEnvForFe(c) {
  let envForFe = {}
  try { envForFe = { ...getEnv(), ...(c.env || {}) } } catch { envForFe = { ...getEnv() } }

  const user = c.get('user')
  const claims = c.get('authClaims')

  envForFe.USER_ID = user?.id ?? ''
  envForFe.USER_ROLE = user?.role ?? ''
  envForFe.TENANT_ID = claims?.tenant ?? c.get('tenantId') ?? ''
  envForFe.authClaims = claims
  envForFe.user = user
  envForFe.requestHeaders = c.req.raw.headers
  envForFe.cookieHeader = c.req.raw.headers.get('cookie') || ''

  // Bases browser-visibles. El portal está en la raíz del subdominio, así que
  // el prefijo de app es vacío: las vistas generan links/acciones relativos
  // a `/`.
  envForFe.UI_BASE = ''
  envForFe.API_BASE = '/api'
  envForFe.AUTH_BASE = getAuthBase()
  envForFe.APPS_BASE = getAppsBase()
  return envForFe
}

async function forwardToFe(c, pathOverride) {
  let executionCtx = {}
  try { executionCtx = c.executionCtx } catch { /* Node no tiene ExecutionContext */ }

  const envForFe = buildEnvForFe(c)
  // Dev: sin Service Binding real (bun server.js), inyectamos el fake que
  // habla HTTP con _auth. Misma signature que `env.AUTH` (paridad local↔prod).
  if (!envForFe.AUTH && isDev) {
    const { getFakeAuthBinding } = await import('./src/dev/fake-auth-binding.mjs')
    envForFe.AUTH = getFakeAuthBinding()
  }

  const url = new URL(c.req.url)
  url.pathname = pathOverride
  const req = new Request(url.toString(), {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: (c.req.method === 'GET' || c.req.method === 'HEAD') ? undefined : c.req.raw.body,
    redirect: 'manual',
  })
  return fe.handleWorker(req, envForFe, executionCtx)
}

// ── API JSON ──────────────────────────────────────────────────────────────
// Va ANTES del catch-all de páginas (Hono matchea en orden de registro).
app.all('/api/*', async (c) => {
  const res = await forwardToFe(c, c.req.path)
  if (res) return res
  return c.json({ error: `Ruta no encontrada: ${c.req.method} ${c.req.path}` }, 404)
})

// ── Páginas ───────────────────────────────────────────────────────────────
// Dashboard en la raíz del subdominio.
app.get('/', (c) => forwardToFe(c, '/api/_ui/portal'))

// Resto de las páginas: /<rest> → /api/_ui/<rest> (flow ui.<rest>).
app.all('/*', async (c) => {
  const res = await forwardToFe(c, `/api/_ui${c.req.path}`)
  return res || c.text('Vista no encontrada', 404)
})

app.notFound((c) => c.json({ error: `Ruta no encontrada: ${c.req.method} ${c.req.path}` }, 404))

app.onError((err, c) => {
  console.error('[portal.error]', err)
  return c.json({ error: err.message || 'Error interno' }, 500)
})

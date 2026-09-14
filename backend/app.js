/**
 * backend/app.js — Hono app para _portal.
 *
 * Responsabilidades:
 *   1. CORS para apps.sivocloud.dev y localhost dev.
 *   2. Logger (dev only).
 *   3. attachAuthClaims middleware — verifica cookie via RPC
 *      `env.AUTH.verifySession`, publica claims en `c.get('authClaims')`.
 *      _portal NO abre DB del tenant (no hay tenant DB) — solo usa la
 *      metadata del broker. Por eso skipTenantDb: true.
 *   4. Sirve frontend/dist/* via env.ASSETS (CF) o Vite dev server.
 *   5. Forward /api/* a flow-engine.
 *
 * Diferencias con apps/sivo-pos/backend/app.js:
 *   - Sin DB del tenant (no hay tenant DB que abrir).
 *   - Sin ability/RBAC (portal = admin UI, no app de negocio).
 *   - Sin /api/products, /api/users, etc. — solo metadata.
 *   - Sin strip de prefijo (ruta única `/portal/*`).
 *
 * Fase 4 (2026-09-14): zero secrets de plataforma. Solo `env.AUTH`.
 */

import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'

import { getEnv } from './src/lib/env.mjs'
import { fe } from './fe.mjs'
import { attachAuthClaims } from './src/middleware/attach-auth-claims.js'

const isDev = getEnv().NODE_ENV !== 'production'

export const app = new Hono()

if (isDev) app.use('*', logger())

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return null
    if (origin.endsWith('.sivocloud.dev')) return origin
    if (origin === 'https://sivocloud.dev') return origin
    if (origin === 'http://localhost:5173') return origin
    if (origin === 'http://localhost:5176') return null  // dev: vite proxy
    return null
  },
  credentials: true,
  allowHeaders: ['content-type', 'x-tenant-id', 'authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['x-tenant-id'],
}))

// Health check (no auth) — registrado FUERA del prefijo /api/* para
// evitar que flow-engine intercepte. URL canónica: /health.
app.get('/health', (c) => c.json({
  status: 'ok',
  app: 'sivocloud-portal',
  phase: 4,
  zeroSecrets: true,
}))

// attachAuthClaims corre en /api/* (no en assets). skipTenantDb: true
// porque _portal no abre DB de tenant — solo lee metadata via RPC.
app.use('/api/*', attachAuthClaims({
  rpcBinding: 'AUTH',
  publicPaths: [],
  skipTenantDb: true,
}))

// Forward /api/* a flow-engine. Antes de delegar, inyectamos el cookie
// en `env.requestHeaders` (Headers instance) para que los custom nodes
// puedan leerlo vía `ctx.env.requestHeaders.get('cookie')`. flow-engine
// todavía no expone headers en ctx — este workaround es la ruta más
// corta hasta que aparezca un ctx.req.headers nativo.
app.all('/api/*', async (c) => {
  const cookieHeader = c.req.raw.headers.get('cookie') || ''
  const enrichedEnv = {
    ...c.env,
    requestHeaders: c.req.raw.headers,
    cookieHeader,
  }
  const req = c.req.raw
  const res = await fe.handleWorker(req, enrichedEnv, c.executionCtx)
  return res || c.notFound()
})

// Root redirect (login flow lives in _auth).
app.get('/', (c) => c.redirect('https://auth.sivocloud.dev/login', 302))

// 404 fallback.
app.notFound((c) => c.json({
  error: `Ruta no encontrada: ${c.req.method} ${c.req.path}`,
}, 404))

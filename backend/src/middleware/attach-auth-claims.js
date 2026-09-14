/**
 * backend/src/middleware/attach-auth-claims.js — Perímetro de identidad
 * para _portal.
 *
 * Diferencia clave con apps/sivo-pos/backend/src/middleware/attach-auth-claims.js:
 * _portal NO abre DB del tenant (skipTenantDb=true). Solo verifica la
 * sesión via RPC y publica claims en el contexto de Hono. La metadata
 * de tenant/apps se pide on-demand al broker en cada flow.
 *
 * Auth flow:
 *   1. Lee cookie `__Secure-sivocloud_session` del request.
 *   2. Dev: si no hay Service Binding, monta fake-auth-binding que pega
 *      contra _auth's HTTP wrappers.
 *   3. Llama `authWorker.verifySession(cookieValue)` → claims.
 *   4. Si exp está vencido → 401.
 *   5. Si claims OK → `c.set('authClaims', claims)` + `c.set('user', ...)`.
 *
 * Dev-only fallbacks:
 *   - `X-Dev-Claims` header (base64 JSON con {sub, tenant, role}).
 *   - HMAC local con SESSION_SECRET (legacy, removido en prod).
 *
 * Phase 4 (2026-09-14): ZERO secrets de plataforma. Solo `env.AUTH`.
 */

import { getEnv } from '../lib/env.mjs'

const COOKIE_NAME_PRIMARY = '__Secure-sivocloud_session'
const COOKIE_NAME_DEV = 'sivocloud_session'
const DEV_CLAIMS_HEADER = 'x-dev-claims'

function readCookieFromHeader(cookieHeader, name) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(/;\s*/)
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    if (k === name) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

function isDev() {
  try { if (import.meta.env && import.meta.env.DEV === true) return true } catch { /* no vite */ }
  return (getEnv().NODE_ENV || 'development') !== 'production'
}

function isPublicPath(pathname, publicPaths) {
  for (const p of publicPaths) {
    if (pathname === p) return true
    if (p.endsWith('/') && pathname.startsWith(p)) return true
    if (pathname.startsWith(p + '/')) return true
  }
  return false
}

export function attachAuthClaims({ rpcBinding = 'AUTH', publicPaths = [], skipTenantDb: _skipTenantDb = false } = {}) {
  return async (c, next) => {
    const pathname = c.req.path || '/'
    if (isPublicPath(pathname, publicPaths)) {
      await next()
      return
    }

    const cookieHeader = c.req.raw.headers.get('cookie') || ''
    const cookieValue = readCookieFromHeader(cookieHeader, COOKIE_NAME_PRIMARY)
                  || readCookieFromHeader(cookieHeader, COOKIE_NAME_DEV)

    let claims = null

    if (isDev()) {
      const devHeader = c.req.raw.headers.get(DEV_CLAIMS_HEADER)
      if (devHeader) {
        try {
          const json = JSON.parse(Buffer.from(devHeader, 'base64').toString('utf8'))
          if (json && json.sub && json.tenant) claims = json
        } catch { /* header inválido */ }
      }
    }

    if (!claims && cookieValue) {
      let authWorker = c.env?.[rpcBinding]
      // Dev: si no hay Service Binding (Node), inyectar fake que habla HTTP
      // con _auth's /api/auth/verify. Misma signature, paridad local↔prod.
      // En CF Workers isDev() es false → nunca se monta.
      if (!authWorker && isDev()) {
        const { getFakeAuthBinding } = await import('../dev/fake-auth-binding.mjs')
        authWorker = getFakeAuthBinding()
      }
      if (authWorker && typeof authWorker.verifySession === 'function') {
        try {
          const result = await authWorker.verifySession(cookieValue)
          if (result && result.valid && result.claims) claims = result.claims
        } catch { /* RPC falló */ }
      }
    }

    if (!claims) {
      return c.json({ error: 'No session', hint: 'login required' }, 401)
    }

    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
      return c.json({ error: 'Session expired' }, 401)
    }

    const user = { id: claims.sub, role: claims.role }
    c.set('authClaims', claims)
    c.set('user', user)
    c.set('tenantId', claims.tenant)

    await next()
  }
}

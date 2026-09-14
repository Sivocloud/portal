/**
 * backend/worker-entry.js — Entrypoint para Cloudflare Workers.
 *
 * Responsabilidades:
 *   1. Setear globalThis.SIVO_ENV con los bindings de CF.
 *   2. Strip del prefijo `/portal/` del URL antes de delegar.
 *      El worker corre bajo `apps.sivocloud.dev/portal/*` (route en
 *      wrangler.jsonc). Después del strip, el path queda como
 *      `/api/portal/me` o `/api/health` (lo que sea que el Hono matchea).
 *   3. Auth gate: requests HTML sin cookie de sesión se redirigen 302 a
 *      `auth.sivocloud.dev/login?return_to=<current>` antes de delegar.
 *      Requests API (`Accept: application/json`) pasan al middleware Hono
 *      que responde 401 JSON — los apps son server-to-server y manejan
 *      "no session" como ausencia de datos.
 *   4. Routing:
 *      - `/api/*` → app.fetch (Hono + flow-engine).
 *      - `/health` → app.fetch (Hono directo).
 *      - resto → env.ASSETS.fetch (SPA shell).
 *
 * Phase 4 (2026-09-14): ZERO secrets de plataforma. El worker NO firma
 * cookies, NO descifra tokens, NO accede a DB de plataforma. Todo eso lo
 * hace _auth via Service Binding RPC `env.AUTH`.
 *
 * URL canónica:
 *   https://apps.sivocloud.dev/portal/                  (HTML dashboard)
 *   https://apps.sivocloud.dev/portal/api/health        (GET)
 *   https://apps.sivocloud.dev/portal/api/portal/me     (GET)
 *   https://apps.sivocloud.dev/portal/api/portal/apps   (GET)
 */

import { app } from './app.js'

const APP_PREFIX = '/portal/'
const AUTH_LOGIN_URL = 'https://auth.sivocloud.dev/login'
const COOKIE_PRIMARY = '__Secure-sivocloud_session'
const COOKIE_DEV = 'sivocloud_session'

function stripAppPrefix(pathname) {
  if (pathname === '/portal' || pathname === '/portal/') {
    return '/'
  }
  if (!pathname.startsWith(APP_PREFIX)) {
    return pathname  // pass-through (dev, otros hosts)
  }
  return '/' + pathname.slice(APP_PREFIX.length)
}

function isHandledByApp(restPath) {
  return restPath.startsWith('/api/')
      || restPath.startsWith('/_debug/')
      || restPath === '/health'
}

function isBrowserRequest(request) {
  const accept = request.headers.get('accept') || ''
  return accept.includes('text/html')
}

function hasSessionCookie(request) {
  const cookie = request.headers.get('cookie') || ''
  return cookie.includes(COOKIE_PRIMARY) || cookie.includes(COOKIE_DEV)
}

async function trySpaFallback(request, env) {
  const url = new URL(request.url)
  const indexUrl = new URL('/index.html', url.origin)
  const indexRes = await env.ASSETS.fetch(new Request(indexUrl.toString(), {
    method: request.method,
    headers: request.headers,
  }))
  return indexRes.ok ? indexRes : new Response('Not Found', { status: 404 })
}

export default {
  async fetch(request, env, ctx) {
    globalThis.SIVO_ENV = env

    // Auth gate (HTML only): browsers sin cookie de sesión → 302 al login.
    // Esta decisión corre ANTES del strip del prefix para que el
    // return_to conserve el path original completo.
    if (isBrowserRequest(request) && !hasSessionCookie(request)) {
      const returnTo = new URL(request.url).toString()
      const url = `${AUTH_LOGIN_URL}?return_to=${encodeURIComponent(returnTo)}`
      return Response.redirect(url, 302)
    }

    // Strip /portal/ del URL.
    const url = new URL(request.url)
    const newPath = stripAppPrefix(url.pathname)
    url.pathname = newPath

    request = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect,
    })

    // /api/* → Hono (con auth + flow-engine).
    if (isHandledByApp(newPath)) {
      return app.fetch(request, env, ctx)
    }

    // Resto → ASSETS (con SPA fallback para navegación).
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request)
      if (assetRes.ok) return assetRes
      const secFetch = request.headers.get('sec-fetch-mode')
      if (secFetch === 'navigate') {
        return trySpaFallback(request, env)
      }
      return assetRes
    }

    return new Response('Not Found', { status: 404 })
  },
}

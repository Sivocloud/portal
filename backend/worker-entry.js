/**
 * backend/worker-entry.js — Entrypoint para Cloudflare Workers.
 *
 * Responsabilidades:
 *   1. Setear globalThis.SIVO_ENV con los bindings de CF.
 *   2. Delegar TODO a la app Hono (páginas HTML, fragmentos HTMX, assets
 *      estáticos y API JSON). NO hay SPA, NO hay binding ASSETS.
 *
 * El worker corre en su propio subdominio `portal.sivocloud.dev/*` (route en
 * wrangler.jsonc), así que los paths llegan limpios (sin prefijo de app):
 * dev (`localhost:3034/`) y prod (`portal.sivocloud.dev/`) comparten el mismo
 * shape de URL.
 *
 * Phase 4 (2026-09-14): ZERO secrets de plataforma. El worker NO firma
 * cookies, NO descifra tokens, NO accede a DB de plataforma. Todo eso lo
 * hace _auth via Service Binding RPC `env.AUTH`.
 *
 * URL canónica:
 *   https://portal.sivocloud.dev/                  (dashboard)
 *   https://portal.sivocloud.dev/static/app.css
 *   https://portal.sivocloud.dev/api/portal/me     (GET)
 *   https://portal.sivocloud.dev/api/portal/apps   (GET)
 */

import { app } from './app.js'

export default {
  async fetch(request, env, ctx) {
    globalThis.SIVO_ENV = env
    return app.fetch(request, env, ctx)
  },
}

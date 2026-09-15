/**
 * static.js — Assets estáticos de la UI (CSS, htmx, islands).
 *
 * Se sirven desde Hono (no son endpoints de negocio). En Workers no hay
 * filesystem: CSS y islands viven en módulos-string generados/bundleados.
 */
import { CSS } from './styles.js'
import htmxSource from './vendor/htmx-inline.mjs'
import { ISLANDS } from './islands-inline.mjs'

const JS_HEADERS = { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache' }

/**
 * @param {string} rel - path relativo después de `/static` (ej. `/app.css`)
 * @returns {Response|null}
 */
export function serveUiStatic(rel) {
  if (rel === '/app.css') {
    return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
  }
  if (rel === '/htmx.min.js') {
    return new Response(htmxSource, { headers: { ...JS_HEADERS, 'cache-control': 'public, max-age=3600' } })
  }
  if (rel.startsWith('/islands/')) {
    const name = rel.slice('/islands/'.length)
    if (ISLANDS[name]) return new Response(ISLANDS[name], { headers: JS_HEADERS })
  }
  return null
}

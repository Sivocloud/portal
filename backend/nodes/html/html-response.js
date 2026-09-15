import { getPath } from '@sivo/flow-engine/node-helpers'
import { renderView } from '../../src/ui/templates/index.js'
import { shell } from '../../src/ui/pages.js'
import { toastOob } from '../../src/ui/fragments.js'
import { getAppBases } from '../../src/lib/env.mjs'

/**
 * Custom node `ui.html-response` — renderiza una vista server-side y la
 * devuelve como respuesta HTTP `text/html`.
 *
 * Nodo TERMINAL (outputs: 0): setea `ctx.flow.httpResponse` y corta la rama.
 * Los flows de UI (`ui.*.flow.json`) terminan acá.
 *
 * `layout: 'app'` envuelve el HTML en el shell (sidebar + topbar); `'none'`
 * lo devuelve pelado (fragmentos para swaps HTMX).
 *
 * @table none
 * @param {string} view - nombre de la vista registrada en src/ui/templates
 * @param {string} [dataPath] - dot-path a los datos (default payload)
 * @param {string} [layout] - 'app' | 'none' (default 'app')
 * @param {string} [title] - título de la página (override)
 * @param {string} [statusCode] - status HTTP (default 200)
 * @param {string} [oobPath] - dot-path a { type, message } para un toast OOB
 * @returns {null} termina la rama con ctx.flow.httpResponse seteado
 */
export default {
  type: 'ui.html-response',
  name: 'UI: HTML Response',
  category: 'ui',
  inputs: 1,
  outputs: 0,
  defaults: {
    view: { value: '', type: 'text', label: 'Vista' },
    dataPath: { value: 'payload.data', type: 'text', label: 'Data path' },
    layout: { value: 'app', type: 'select', label: 'Layout', options: [
      { value: 'app', label: 'app (shell)' },
      { value: 'none', label: 'none (fragmento)' },
    ] },
    title: { value: '', type: 'text', label: 'Título (opcional)' },
    statusCode: { value: '200', type: 'text', label: 'Status' },
    oobPath: { value: '', type: 'text', label: 'Toast OOB path (opcional)' },
  },
  async execute(node, msg, ctx) {
    const base = ctx.env?.UI_BASE || ''
    const authBase = ctx.env?.AUTH_BASE || ''
    const appsBase = ctx.env?.APPS_BASE || ''
    const role = ctx.env?.USER_ROLE || ''
    const data = node.dataPath ? (getPath(msg, node.dataPath) ?? {}) : (msg.payload ?? {})
    const query = msg.payload ?? {}

    const viewCtx = {
      data,
      base,
      authBase,
      appsBase,
      appBases: getAppBases(),
      query,
      tenantId: ctx.env?.TENANT_ID || '',
      user: ctx.env?.user || {},
      role,
    }

    try {
      const out = renderView(node.view, viewCtx)
      const layout = node.layout || out.layout || 'app'
      let body = out.html
      if (layout === 'app') {
        body = shell({
          base,
          apiBase: ctx.env?.API_BASE || '',
          authBase,
          tenantId: ctx.env?.TENANT_ID || '',
          user: ctx.env?.user || {},
          role,
          active: out.active,
          title: node.title || out.title,
          contentHtml: out.html,
        })
      }
      if (node.oobPath) {
        const oob = getPath(msg, node.oobPath)
        if (oob && oob.message) body = toastOob(oob.type || 'success', oob.message) + body
      }
      ctx.flow.httpResponse = {
        status: Number(node.statusCode) || 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        body,
      }
      return null
    } catch (err) {
      ctx.log?.(`✖ ui.html-response: ${err.message}`)
      const out = renderView('error', { ...viewCtx, status: 500, message: err.message || 'Error al renderizar' })
      let body = out.html
      if ((node.layout || out.layout || 'app') === 'app') {
        body = shell({
          base,
          apiBase: ctx.env?.API_BASE || '',
          authBase,
          tenantId: ctx.env?.TENANT_ID || '',
          user: ctx.env?.user || {},
          role,
          active: '',
          title: 'Error',
          contentHtml: out.html,
        })
      }
      ctx.flow.httpResponse = {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
        body,
      }
      return null
    }
  },
}

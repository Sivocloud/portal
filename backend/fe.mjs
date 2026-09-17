/**
 * backend/fe.mjs — ÚNICA instancia de flow-engine para _portal.
 *
 * Diferencias con _auth/fe.mjs y apps/sivo-pos/fe.mjs:
 *   - CERO CP/DB bindings. Solo necesita core nodes + los custom nodes del
 *     portal (todos RPC vía `env.AUTH`).
 *   - Sin connection: "tenant" (no hay tenant DB).
 *   - Cookie NO se verifica acá — el perímetro (Astro middleware) ya lo hizo.
 *     flow-engine solo lee claims de `ctx.env`.
 *
 * Los flows son INTERNOS: no hay Hono que los exponga. Las páginas/endpoints
 * de Astro los llaman in-process (`runFlow` en `src/lib/server/flows.ts`),
 * que usa el `http-in` de cada flow como dirección.
 *
 * Phase 4 (2026-09-14): zero secrets. Cero D1. Cero Turso.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFlowEngineApp } from '@sivo/flow-engine/app'
import { coreNodes } from '@sivo/flow-engine/nodes'

import { getEnv } from './src/lib/env.mjs'

import errorHandler500Flow from './flows/error-handler-500.flow.json' with { type: 'json' }
import portalOverviewFlow  from './flows/portal.overview.flow.json' with { type: 'json' }
import portalAppsFlow      from './flows/portal.apps.flow.json' with { type: 'json' }
import portalBillingFlow   from './flows/portal.billing.flow.json' with { type: 'json' }
import portalAppToggleFlow from './flows/portal.app.toggle.flow.json' with { type: 'json' }
import portalSupportFlow   from './flows/portal.support.set.flow.json' with { type: 'json' }
import portalAutoRenewFlow from './flows/portal.autorenew.set.flow.json' with { type: 'json' }
import portalCheckoutFlow  from './flows/portal.billing-checkout.flow.json' with { type: 'json' }
import portalSessionFlow   from './flows/portal.billing-portal.flow.json' with { type: 'json' }

import { extraNodes } from './nodes/index.js'

const FLOWS = {
  'error-handler-500':    errorHandler500Flow,
  'portal.overview':      portalOverviewFlow,
  'portal.apps':          portalAppsFlow,
  'portal.billing':       portalBillingFlow,
  'portal.app.toggle':    portalAppToggleFlow,
  'portal.support.set':   portalSupportFlow,
  'portal.autorenew.set': portalAutoRenewFlow,
  'portal.billing-checkout': portalCheckoutFlow,
  'portal.billing-portal':   portalSessionFlow,
}

const __dirname = (() => {
  try {
    if (typeof import.meta.url !== 'string' || !import.meta.url) return null
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return null
  }
})()

const isDev = getEnv().NODE_ENV !== 'production'

export const fe = await createFlowEngineApp({
  runtime: 'worker',
  flows: FLOWS,
  coreNodes,
  extraNodes,
  configNodes: [],
  httpNodeRoot: '/api',
  ...(isDev && __dirname ? { customNodesDir: path.join(__dirname, 'nodes') } : {}),
})

/**
 * backend/fe.mjs — ÚNICA instancia de flow-engine para _portal.
 *
 * Diferencias con _auth/fe.mjs y sivo-pos/fe.mjs:
 *   - CERO CP/DB bindings. Solo necesita core nodes + custom nodes
 *     `portal-me` y `portal-apps`.
 *   - Sin connection: "tenant" (no hay tenant DB).
 *   - Cookie NO se verifica acá — `attachAuthClaims` middleware ya lo
 *     hizo. flow-engine solo lee claims de `ctx.env`.
 *
 * Para Phase 4 los flows son `portal-me` y `portal-apps`. Cada uno llama
 * un RPC del broker vía custom node.
 *
 * Phase 4 (2026-09-14): zero secrets. Cero D1. Cero Turso.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFlowEngineApp } from '@sivo/flow-engine/app'
import { coreNodes } from '@sivo/flow-engine/nodes'

import { getEnv } from './src/lib/env.mjs'

import errorHandler500Flow from './flows/error-handler-500.flow.json' with { type: 'json' }
import portalMeFlow       from './flows/portal-me.flow.json' with { type: 'json' }
import portalAppsFlow     from './flows/portal-apps.flow.json' with { type: 'json' }
import uiPortalFlow       from './flows/ui.portal.flow.json' with { type: 'json' }
import uiBillingFlow        from './flows/ui.billing.flow.json' with { type: 'json' }
import uiBillingSupportFlow from './flows/ui.billing-support.flow.json' with { type: 'json' }
import uiBillingAutoRenewFlow from './flows/ui.billing-autorenew.flow.json' with { type: 'json' }
import uiAppsFlow           from './flows/ui.apps.flow.json' with { type: 'json' }
import uiAppsToggleFlow     from './flows/ui.apps-toggle.flow.json' with { type: 'json' }
import uiBillingCheckoutFlow from './flows/ui.billing-checkout.flow.json' with { type: 'json' }
import uiBillingPortalFlow   from './flows/ui.billing-portal.flow.json' with { type: 'json' }

import { extraNodes } from './nodes/index.js'

const FLOWS = {
  'error-handler-500': errorHandler500Flow,
  'portal-me':         portalMeFlow,
  'portal-apps':       portalAppsFlow,
  'ui.portal':         uiPortalFlow,
  'ui.billing':        uiBillingFlow,
  'ui.billing-support':   uiBillingSupportFlow,
  'ui.billing-autorenew': uiBillingAutoRenewFlow,
  'ui.apps':              uiAppsFlow,
  'ui.apps-toggle':       uiAppsToggleFlow,
  'ui.billing-checkout':  uiBillingCheckoutFlow,
  'ui.billing-portal':    uiBillingPortalFlow,
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

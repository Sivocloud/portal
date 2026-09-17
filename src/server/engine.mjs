/**
 * src/server/engine.mjs — ÚNICA instancia de flow-engine para _portal.
 *
 * Mismo rol que `apps/sivo-pos/src/server/engine.js`:
 *   - CERO CP/DB bindings. Solo necesita core nodes + los custom nodes del
 *     portal (todos RPC vía `env.AUTH`).
 *   - Sin "tenant" DB: los flows piden metadata vía RPC a `_auth`.
 *   - Cookie NO se verifica acá — el perímetro (Astro middleware) ya lo hizo.
 *     flow-engine solo lee claims de `ctx.env`.
 *
 * Los flows son INTERNOS: no hay Hono que los exponga. Las páginas/endpoints
 * de Astro los llaman in-process (`runFlow` en `src/server/host/flows.ts`),
 * que usa el `http-in` de cada flow como dirección.
 *
 * Phase 4 (2026-09-14): zero secrets. Cero D1. Cero Turso.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFlowEngineApp } from '@sivo/flow-engine/app'
import { coreNodes } from '@sivo/flow-engine/nodes'

import { getEnv } from './lib/env.mjs'
import { extraNodes } from './nodes/index.js'

// ── Registro de flows ────────────────────────────────────────────────────
// El directorio `flows/` ES el registro (mismo patrón que apps/sivo-pos): la
// clave de cada flow es su filename sin `.flow.json` (notación dot:
// `portal.billing-checkout`). Sin lista a mano no hay forma de agregar un flow
// y olvidarse de registrarlo (antes eran 9 imports + 9 entradas que espejaban
// el directorio).
const flowModules = import.meta.glob('./flows/*.flow.json', { eager: true, import: 'default' })

const FLOWS = Object.fromEntries(
  Object.entries(flowModules).map(([file, flow]) => [
    file.replace('./flows/', '').replace('.flow.json', ''),
    flow,
  ]),
)

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

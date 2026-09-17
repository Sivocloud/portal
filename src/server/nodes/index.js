/**
 * backend/nodes/index.js — Registry de custom nodes de _portal.
 *
 * Patrón idéntico a apps/sivo-pos/backend/nodes/index.js. Todos los nodos son
 * RPC vía `env.AUTH` (portal zero-secrets):
 *   - `portal-overview` / `portal-apps-catalog` / `portal-billing`: reads.
 *   - `portal-app-toggle` / `portal-set-support` / `portal-set-autorenew`: writes.
 *   - `portal-paddle-checkout` / `portal-paddle-portal`: Paddle.
 */

import portalOverview      from './portal/portal-overview.js'
import portalBilling       from './portal/portal-billing.js'
import portalSetSupport    from './portal/portal-set-support.js'
import portalSetAutoRenew  from './portal/portal-set-autorenew.js'
import portalAppsCatalog   from './portal/portal-apps-catalog.js'
import portalAppToggle     from './portal/portal-app-toggle.js'
import portalPaddleCheckout from './portal/portal-paddle-checkout.js'
import portalPaddlePortal   from './portal/portal-paddle-portal.js'

export const extraNodes = [
  portalOverview,
  portalBilling,
  portalSetSupport,
  portalSetAutoRenew,
  portalAppsCatalog,
  portalAppToggle,
  portalPaddleCheckout,
  portalPaddlePortal,
]

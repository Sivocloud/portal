/**
 * backend/nodes/index.js — Registry de custom nodes de _portal.
 *
 * Patrón idéntico a apps/sivo-pos/backend/nodes/index.js.
 * Solo 2 nodos custom (portal-me, portal-apps). Todo el resto lo
 * cubre flow-engine core.
 */

import portalMe   from './auth/portal-me.js'
import portalApps from './auth/portal-apps.js'

export const extraNodes = [
  portalMe,
  portalApps,
]

/**
 * backend/nodes/index.js — Registry de custom nodes de _portal.
 *
 * Patrón idéntico a apps/sivo-pos-htmx/backend/nodes/index.js.
 *   - `portal-me` / `portal-apps`: RPC nodes de la API JSON (backward-compat).
 *   - `portal-overview`: agregado del dashboard (RPC).
 *   - `ui.html-response`: render server-side (HTMX).
 */

import portalMe       from './auth/portal-me.js'
import portalApps     from './auth/portal-apps.js'
import portalOverview from './portal/portal-overview.js'
import htmlResponse   from './html/html-response.js'

export const extraNodes = [
  portalMe,
  portalApps,
  portalOverview,
  htmlResponse,
]

/**
 * templates/index.js — Registro de vistas server-rendered del portal.
 *
 * Cada vista es una función `(ctx) => { title, active, html, layout? }`.
 * `ctx` = { data, base, authBase, appsBase, tenantId, user, role, query }.
 */
import { portalView } from './portal.js'
import { billingView } from './billing.js'
import { errorView, notFoundView } from './misc.js'

const VIEWS = {
  'portal': portalView,
  'billing': billingView,
  'error': errorView,
  'not-found': notFoundView,
}

export function hasView(name) {
  return typeof VIEWS[name] === 'function'
}

export function renderView(name, ctx) {
  const fn = VIEWS[name] || notFoundView
  const out = fn(ctx) || {}
  return {
    title: out.title || 'Portal',
    active: out.active || '',
    html: out.html || '',
    layout: out.layout || 'app',
  }
}

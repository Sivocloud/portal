/**
 * nav.ts — Definición del nav del portal (sidebar).
 *
 * Portado de `backend/src/ui/pages.js` (NAV + NAV_SOON). El portal no tiene
 * RBAC: todas las secciones visibles. `key` es el `active` que marca cada
 * página (viene del layout, no se deduce del path).
 */

export interface NavItem {
  key: string
  href: string
  label: string
  icon: string
}

/** Ítems de navegación reales. */
export const NAV: NavItem[] = [
  { key: 'portal', href: '/', label: 'Inicio', icon: 'apps' },
  { key: 'apps', href: '/aplicaciones', label: 'Aplicaciones', icon: 'store' },
  { key: 'billing', href: '/facturacion', label: 'Facturación', icon: 'billing' },
]

/** Secciones futuras (placeholder hasta que existan). */
export const NAV_SOON: NavItem[] = [
  { key: 'config', href: '', label: 'Configuración', icon: 'config' },
]

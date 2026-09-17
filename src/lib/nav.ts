/**
 * nav.ts — Nav del sidebar (derivado de `page-feeds.ts`).
 *
 * El portal no tiene RBAC: todas las secciones son visibles. `key` es el
 * `active` que marca cada página (viene del layout, no se deduce del path).
 * `NAV_SOON` son secciones futuras (placeholder).
 */
import { navItems } from '../server/lib/page-feeds'

export interface NavItem {
  key: string
  href: string
  label: string
  icon: string
}

/** Ítems de navegación reales — fuente única: `PAGE_FEEDS`. */
export const NAV: NavItem[] = navItems()

/** Secciones futuras (placeholder hasta que existan). */
export const NAV_SOON: NavItem[] = [
  { key: 'config', href: '', label: 'Configuración', icon: 'config' },
]

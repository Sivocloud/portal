/**
 * page-feeds.ts — LA tabla de rutas del portal.
 *
 * Única fuente de:
 *   1. el path público del read flow de cada pantalla (el `http-in` del flow),
 *   2. el NAV del shell (`lib/nav.ts` deriva los ítems de acá),
 *   3. los paths sin sesión (`PUBLIC_PATHS`, que consume el middleware).
 *
 * Por qué un solo lugar: si la página y su dataset declararan el path por
 * separado, cambiarlo en uno y no en el otro daba un 404 en el render sin error
 * de build (o —peor— servía el dataset de otra pantalla). Con esto, la página
 * no repite el path: `loadPage(Astro)` lo deriva de la URL.
 *
 * A diferencia de sivo-pos, el portal NO tiene RBAC (toda la UI es visible) ni
 * paths de tenant, así que la tabla no declara `ability` ni `parseAppPath`: el
 * perímetro solo resuelve la sesión.
 *
 * `pages` : ruta(s) de la pantalla (el portal vive en la raíz del subdominio).
 * `flow`  : el flow que devuelve el dataset (nombre del `.flow.json`).
 * `path`  : el path público de ese flow (`/api/...`); la regla 4 del check de
 *           arquitectura verifica que coincida con el `http-in` del flow.
 * `nav`   : cómo se ve la pantalla en el sidebar (`null` = no aparece).
 *           El ORDEN de las filas es el orden del nav.
 */

export interface PageFeed {
  pages: string[]
  flow: string
  path: string
  nav: { key: string; label: string; icon: string } | null
}

export const PAGE_FEEDS: PageFeed[] = [
  { pages: ['/'],             flow: 'portal.overview', path: '/api/portal/overview', nav: { key: 'portal',  label: 'Inicio',       icon: 'apps' } },
  { pages: ['/aplicaciones'], flow: 'portal.apps',     path: '/api/portal/apps',     nav: { key: 'apps',    label: 'Aplicaciones', icon: 'store' } },
  { pages: ['/facturacion'],  flow: 'portal.billing',  path: '/api/portal/billing',  nav: { key: 'billing', label: 'Facturación',  icon: 'billing' } },
]

/** Paths públicos (sin sesión): el healthcheck. */
export const PUBLIC_PATHS = ['/health', '/api/health']

/**
 * Fila de la pantalla `page` (`/facturacion`), o null si esa ruta no la declara.
 *
 * Normaliza el trailing slash (`/facturacion/` → `/facturacion`): Astro sirve
 * las dos, pero la tabla declara la canónica.
 */
export function feedFor(page: string): PageFeed | null {
  const normalized = page.length > 1 ? page.replace(/\/+$/, '') : page
  return PAGE_FEEDS.find((f) => f.pages.includes(normalized)) ?? null
}

/**
 * Ítems del sidebar, en el orden de `PAGE_FEEDS`. `href` es la primera ruta de
 * la fila (el portal no declara rutas múltiples, pero la forma se mantiene
 * igual que en sivo-pos).
 */
export function navItems(): { key: string; href: string; label: string; icon: string }[] {
  return PAGE_FEEDS
    .filter((f) => f.nav)
    .map((f) => ({
      key: f.nav!.key,
      href: f.pages[0],
      label: f.nav!.label,
      icon: f.nav!.icon,
    }))
}

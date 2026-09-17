/**
 * src/lib/server/page-data.ts — el dataset de una pantalla, en un solo lugar.
 *
 * La página declara SU RUTA (`/facturacion`) y los filtros de la URL; de ahí
 * sale todo: qué flow la alimenta y por qué path se le pide (`page-feeds.ts`,
 * que es también la fuente del nav). **Las páginas no repiten el path del flow.**
 *
 * El circuito: filtros (`<form method="get">`, query string) → flow (RPC a
 * `_auth`) → template. Como cada búsqueda es una URL, el prefetch y la caché
 * del browser funcionan sin JS.
 */
import { runFlow } from './flows'
import { feedFor } from '../page-feeds'

export interface PageData {
  status: number
  data: Record<string, any>
  error: string | null
  ms: number
}

/**
 * Datos de la pantalla ACTUAL: el 95% de los casos.
 *
 * Deriva el `page` del path real (no se repite en cada `.astro`), toma la
 * cookie de sesión del request y reenvía los filtros al flow.
 *
 * @example
 *   const { data, error, ms } = await loadPage(Astro, { q })
 */
export async function loadPage(
  context: { url: URL; locals: any; request: Request },
  params: Record<string, unknown> = {},
): Promise<PageData> {
  const feed = feedFor(context.url.pathname)
  if (!feed?.path) return { status: 200, data: {}, error: null, ms: 0 }

  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString()

  const t0 = performance.now()
  const { status, data } = await runFlow(`${feed.path}${qs ? `?${qs}` : ''}`, {
    locals: context.locals,
    cookieHeader: context.request.headers.get('cookie') || '',
  })
  return {
    status,
    data: data && typeof data === 'object' ? data : {},
    error: status >= 400 ? (data?.error ?? `Error ${status}`) : null,
    ms: Math.round(performance.now() - t0),
  }
}

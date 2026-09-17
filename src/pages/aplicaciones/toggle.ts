/**
 * POST /aplicaciones/toggle?action=uninstall|reactivate&appSlug=<slug>
 *
 * Write: llama el flow `portal.app.toggle` (RPC a `_auth`) y vuelve a
 * `/aplicaciones` por PRG con un flash. El render de la página re-consulta el
 * estado real: nunca se confía en el cliente.
 */
import type { APIRoute } from 'astro'
import { runFlow } from '../../lib/server/flows'

export const prerender = false

export const POST: APIRoute = async ({ locals, request, url, redirect }) => {
  const action = url.searchParams.get('action') || ''
  const appSlug = url.searchParams.get('appSlug') || ''

  const { data } = await runFlow(
    `/api/portal/apps/toggle?action=${encodeURIComponent(action)}&appSlug=${encodeURIComponent(appSlug)}`,
    { locals, cookieHeader: request.headers.get('cookie') || '', method: 'POST' },
  )

  const ok = (data as any)?.ok === true
  const flash = ok
    ? (action === 'reactivate' ? 'app_reactivated' : 'app_uninstalled')
    : 'app_failed'
  return redirect(`/aplicaciones?flash=${flash}`, 303)
}

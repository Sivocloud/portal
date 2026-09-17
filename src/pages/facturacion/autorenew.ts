/**
 * POST /facturacion/autorenew?enabled=true|false
 *
 * Write: flow `portal.autorenew.set` (RPC `setAutoRenew`) + PRG a
 * `/facturacion` con flash.
 */
import type { APIRoute } from 'astro'
import { runFlow } from '../../lib/server/flows'

export const prerender = false

export const POST: APIRoute = async ({ locals, request, url, redirect }) => {
  const enabled = url.searchParams.get('enabled') !== 'false'

  const { data } = await runFlow(
    `/api/portal/billing/autorenew?enabled=${enabled ? 'true' : 'false'}`,
    { locals, cookieHeader: request.headers.get('cookie') || '', method: 'POST' },
  )

  const ok = (data as any)?.ok === true
  const flash = ok ? (enabled ? 'autorenew_on' : 'autorenew_off') : 'autorenew_failed'
  return redirect(`/facturacion?flash=${flash}`, 303)
}

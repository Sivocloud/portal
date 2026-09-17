/**
 * POST /facturacion/soporte?planCode=none|standard|premium
 *
 * Write: flow `portal.support.set` (RPC `setSupportPlan`) + PRG a
 * `/facturacion` con flash.
 */
import type { APIRoute } from 'astro'
import { runFlow } from '../../lib/server/flows'

export const prerender = false

export const POST: APIRoute = async ({ locals, request, url, redirect }) => {
  const planCode = url.searchParams.get('planCode') || 'none'

  const { data } = await runFlow(
    `/api/portal/billing/support?planCode=${encodeURIComponent(planCode)}`,
    { locals, cookieHeader: request.headers.get('cookie') || '', method: 'POST' },
  )

  const ok = (data as any)?.ok === true
  return redirect(`/facturacion?flash=${ok ? 'support_updated' : 'support_failed'}`, 303)
}

/**
 * POST /api/facturacion/checkout — crea la transacción de Paddle (JSON).
 * La usa la isla `paddle.ts`. El flow (`portal.billing-checkout`) hace el RPC
 * a `_auth`/`_controlplane`; el portal no tiene secrets de Paddle.
 */
import type { APIRoute } from 'astro'
import { runFlow } from '../../../server/host/flows'

export const prerender = false

export const POST: APIRoute = async ({ locals, request }) => {
  const payload = await request.json().catch(() => ({}))
  const { data } = await runFlow('/api/portal/billing/checkout', {
    locals,
    cookieHeader: request.headers.get('cookie') || '',
    method: 'POST',
    payload,
  })
  return new Response(JSON.stringify(data ?? { ok: false, reason: 'error' }), {
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * POST /api/facturacion/portal — sesión del Customer Portal de Paddle (JSON).
 * Devuelve `{ ok, url }`; la isla `paddle.ts` redirige.
 */
import type { APIRoute } from 'astro'
import { runFlow } from '../../../server/host/flows'

export const prerender = false

export const POST: APIRoute = async ({ locals, request }) => {
  const { data } = await runFlow('/api/portal/billing/portal', {
    locals,
    cookieHeader: request.headers.get('cookie') || '',
    method: 'POST',
    payload: {},
  })
  return new Response(JSON.stringify(data ?? { ok: false, reason: 'error' }), {
    headers: { 'content-type': 'application/json' },
  })
}

import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'ok', app: 'sivocloud-portal', zeroSecrets: true }), {
    headers: { 'content-type': 'application/json' },
  })

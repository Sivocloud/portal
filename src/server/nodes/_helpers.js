/**
 * backend/nodes/_helpers.js — Helpers reusables por nodos custom.
 *
 * Patrón idéntico a apps/sivo-pos/backend/nodes/_helpers.js y
 * _auth/backend/nodes/_helpers.js. Centraliza:
 *   - failWith(ctx, status, error, extra) — setea ctx.flow.httpResponse
 *     defensivo + devuelve null al output 0.
 *   - failGate(ctx, msg, status, error, extra) — failWith + tupla
 *     [null, msgConError] para cablear como wire explícito de un
 *     outputs: 2 (desenlace de negocio real, ej. 409).
 *   - denyFromHttpResponse(ctx, msg) — extrae httpResponse de vuelta
 *     a payload (para nodos que responden vía subflows).
 *   - dataWrap(payload) — wrappea en `{ data: ... }` para uniformidad
 *     de respuesta.
 */

export function failWith(ctx, status, error, extra = {}) {
  if (ctx?.flow) {
    ctx.flow.httpResponse = {
      status,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error, ...extra }),
    }
  }
  return null
}

export function failGate(ctx, msg, status, error, extra = {}) {
  failWith(ctx, status, error, extra)
  return [null, { ...(msg || {}), payload: { data: { valid: false, reason: error, ...extra } } }]
}

export function denyFromHttpResponse(ctx, msg) {
  if (ctx?.flow?.httpResponse && msg) {
    try {
      const body = JSON.parse(ctx.flow.httpResponse.body || '{}')
      return [{ ...msg, payload: body }, null]
    } catch { /* fallthrough */ }
  }
  return [msg, null]
}

export function dataWrap(payload) {
  return { data: payload }
}

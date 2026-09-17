/**
 * src/lib/server/flows.ts — Puente in-process entre Astro y flow-engine.
 *
 * Las páginas/endpoints NO tienen lógica de negocio: piden datos llamando al
 * flow que corresponde. La llamada es **in-process** (`fe.handleWorker`):
 * mismo isolate, sin hop HTTP.
 *
 * `feEnv()` arma el `env` que ven los flows: bindings del worker + identidad
 * (USER_ID/TENANT_ID/rol) + el cookie de sesión (los nodos lo leen de
 * `ctx.env.cookieHeader`) + el Service Binding `AUTH` (o su fake en dev).
 */
import { env } from 'cloudflare:workers'
import { fe } from '../../../backend/fe.mjs'
import { getEnv, getAuthBase, getAppsBase } from '../../../backend/src/lib/env.mjs'

export function feEnv(locals: any, { cookieHeader = '', extra = {} as any } = {}) {
  const id = locals?.identity
  return {
    ...getEnv(),
    ...extra,
    USER_ID: id?.user?.id ?? '',
    USER_ROLE: id?.user?.role ?? '',
    TENANT_ID: id?.claims?.tenant ?? '',
    authClaims: id?.claims,
    user: id?.user,
    cookieHeader,
    // El portal vive en la raíz del subdominio: prefijo de app vacío.
    UI_BASE: '',
    API_BASE: '/api',
    AUTH_BASE: getAuthBase(),
    APPS_BASE: getAppsBase(),
    // Service Binding RPC (o el fake HTTP de dev publicado por el middleware).
    AUTH: (env as any)?.AUTH || (globalThis as any).__SIVO_DEV_AUTH__,
  }
}

export type FlowResult = { status: number; data: any }

/**
 * Llama a un endpoint de flow por su path público (el de su nodo `http-in`),
 * in-process.
 *
 * @example
 *   const { data } = await runFlow('/portal/overview', { locals, cookieHeader })
 */
export async function runFlow(
  path: string,
  {
    locals,
    cookieHeader = '',
    method = 'GET',
    payload,
  }: { locals: any; cookieHeader?: string; method?: string; payload?: any },
): Promise<FlowResult> {
  const headers: Record<string, string> = {}
  let body: string | undefined
  if (payload !== undefined && method !== 'GET' && method !== 'HEAD') {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(payload)
  }
  const req = new Request(`https://sivo.internal${path}`, { method, headers, body })
  const ctx = (locals as any)?.cfContext
  const res = await fe.handleWorker(req, feEnv(locals, { cookieHeader }), ctx)
  if (!res) return { status: 404, data: null }
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

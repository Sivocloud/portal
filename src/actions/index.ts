/**
 * src/actions/index.ts — Astro Actions de la UI.
 *
 * Una Action es un POST con validación tipada (Zod) y (opcional)
 * POST/Redirect/GET. Reemplazan a los endpoints `src/pages/**\/*.ts` que
 * repetían el mismo `runFlow` + `redirect` a mano.
 *
 * **Las Actions NO reimplementan negocio**: llaman al flow in-process con
 * `runFlow` (el mismo camino que el API y que las páginas) y traducen el status
 * del flow a un `ActionError`. El flow sigue siendo la única fuente de verdad.
 *
 * **PRG**: el handler devuelve datos; el redirect + el flash los hace el
 * middleware (`src/middleware.ts`) con una cookie de un solo uso, y la página
 * los lee con `Astro.getActionResult()` (ver `lib/flash.ts`). Sin KV: el portal
 * sigue con cero bindings.
 */
import { defineAction, ActionError, type ActionAPIContext } from 'astro:actions'
import { z } from 'astro/zod'
import { runFlow } from '../lib/server/flows'

/** Toast que devuelven los write nodes (`payload.data.toast`). */
export interface Toast {
  type: string
  message: string
}

/**
 * Llama a un flow in-process y normaliza el error para la UI.
 *
 * Un campo de formulario vacío (`''`) es un campo **no enviado**: se descarta
 * antes de llamar al flow (es la semántica del browser).
 */
async function callFlow(
  ctx: ActionAPIContext,
  path: string,
  payload: Record<string, unknown>,
): Promise<any> {
  const body = Object.fromEntries(
    Object.entries(payload ?? {}).filter(([, v]) => v !== '' && v !== undefined),
  )
  const { status, data } = await runFlow(path, {
    locals: ctx.locals,
    cookieHeader: ctx.request.headers.get('cookie') || '',
    method: 'POST',
    payload: body,
  })
  if (status >= 400) {
    throw new ActionError({
      code: status === 403 ? 'FORBIDDEN' : status === 409 ? 'CONFLICT' : 'BAD_REQUEST',
      message: (data as any)?.error || `No se pudo completar la operación (error ${status}).`,
    })
  }
  return (data as any)?.data ?? data
}

/** Desenvuelve el `toast` del flow; si no vino, sintetiza uno. */
function toastOf(data: any, fallback: string, type = 'success'): Toast {
  const t = data?.toast
  if (t && typeof t.message === 'string') return { type: t.type || type, message: t.message }
  return { type, message: fallback }
}

export const server = {
  /** Desinstala o reactiva una app del tenant (`portal.app.toggle`). */
  appToggle: defineAction({
    accept: 'form',
    input: z.object({
      action: z.enum(['uninstall', 'reactivate']),
      appSlug: z.string().min(1).max(64),
    }),
    handler: async (input, ctx) => {
      const data = await callFlow(ctx, '/api/portal/apps/toggle', input)
      const fallback = input.action === 'reactivate'
        ? `App "${input.appSlug}" reactivada.`
        : `App "${input.appSlug}" desinstalada.`
      return { toast: toastOf(data, fallback) }
    },
  }),

  /** Cambia el plan de soporte (`portal.support.set`). */
  setSupport: defineAction({
    accept: 'form',
    input: z.object({
      planCode: z.enum(['none', 'standard', 'premium']),
    }),
    handler: async (input, ctx) => {
      const data = await callFlow(ctx, '/api/portal/billing/support', input)
      const fallback = input.planCode === 'none'
        ? 'Soporte desactivado.'
        : `Soporte ${input.planCode} activado.`
      return { toast: toastOf(data, fallback) }
    },
  }),

  /** Activa/desactiva la auto-renovación (`portal.autorenew.set`). */
  setAutoRenew: defineAction({
    accept: 'form',
    input: z.object({
      // `z.coerce.boolean()` convertiría "false" (string no vacío) en `true`:
      // el valor del form se parsea explícito.
      enabled: z.enum(['true', 'false']).transform((v) => v === 'true'),
    }),
    handler: async (input, ctx) => {
      const data = await callFlow(ctx, '/api/portal/billing/autorenew', { enabled: input.enabled })
      const fallback = input.enabled
        ? 'Auto-renovación activada.'
        : 'Auto-renovación desactivada.'
      return { toast: toastOf(data, fallback) }
    },
  }),
}

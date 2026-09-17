/**
 * flash.ts — Mensajes de flash para el patrón PRG de las Actions.
 *
 * El middleware guarda el resultado de la última Action en una cookie de un
 * solo uso y redirige; la página lo lee con `Astro.getActionResult()` y lo
 * convierte en el toast del shell. Sin códigos en la URL y sin sesión/KV.
 */

export interface Flash {
  type: string
  message: string
}

/**
 * Primer resultado presente entre las Actions de la página, como flash.
 *
 * @example
 *   const flash = flashFromResults(Astro, [actions.setSupport, actions.setAutoRenew])
 */
export function flashFromResults(
  astro: { getActionResult: (action: any) => any },
  actionsList: any[],
): Flash | null {
  for (const action of actionsList) {
    const result = astro.getActionResult(action)
    if (!result) continue
    if (result.error) {
      return {
        type: 'error',
        message: result.error.message || 'No se pudo completar la operación.',
      }
    }
    const toast = result.data?.toast
    if (toast?.message) return { type: toast.type || 'success', message: toast.message }
    return { type: 'success', message: 'Listo.' }
  }
  return null
}

/**
 * flash.ts — Mensajes de flash para el patrón PRG (POST → redirect → GET).
 *
 * Los writes (endpoints de Astro) redirigen a la página con `?flash=<code>`;
 * la página traduce el código a un toast server-rendered. Sin cookie ni
 * sesión: el estado no viaja entre requests.
 */

export const FLASH: Record<string, { type: string; message: string }> = {
  app_uninstalled: { type: 'success', message: 'App desinstalada. Podés reinstalarla dentro de la ventana de retención.' },
  app_reactivated: { type: 'success', message: 'App reactivada.' },
  app_failed: { type: 'error', message: 'No se pudo actualizar la app.' },
  support_updated: { type: 'success', message: 'Plan de soporte actualizado.' },
  support_failed: { type: 'error', message: 'No se pudo actualizar el soporte.' },
  autorenew_on: { type: 'success', message: 'Auto-renovación activada.' },
  autorenew_off: { type: 'success', message: 'Auto-renovación desactivada.' },
  autorenew_failed: { type: 'error', message: 'No se pudo actualizar la auto-renovación.' },
}

export function flashFrom(url: URL): { type: string; message: string } | null {
  const code = url.searchParams.get('flash')
  return code ? FLASH[code] || null : null
}

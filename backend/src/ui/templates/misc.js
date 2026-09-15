/**
 * misc.js — Vistas de error / no encontrado.
 */
import { escapeHtml } from '../fragments.js'

export function errorView(ctx) {
  const status = Number(ctx.status) || 500
  const message = escapeHtml(ctx.message || 'Error interno')
  return {
    title: `Error ${status}`,
    active: '',
    layout: 'app',
    html: `<div class="card"><div class="card-body">
      <h2 class="mb">Error ${status}</h2>
      <p class="muted">${message}</p>
      <div class="mt"><a class="btn" href="${escapeHtml(ctx.base || '')}/apps">Volver al portal</a></div>
    </div></div>`,
  }
}

export function notFoundView(ctx) {
  return {
    title: 'No encontrado',
    active: '',
    layout: 'app',
    html: `<div class="card"><div class="card-body">
      <h2 class="mb">Ruta no encontrada</h2>
      <p class="muted">${escapeHtml(ctx.path || '')}</p>
      <div class="mt"><a class="btn" href="${escapeHtml(ctx.base || '')}/apps">Ir al portal</a></div>
    </div></div>`,
  }
}

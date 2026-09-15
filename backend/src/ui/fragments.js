/**
 * fragments.js — Helpers de render del portal (escape, formato, iconos, toasts).
 *
 * Todo el HTML server-rendered pasa por acá. `base` es el prefijo
 * browser-visible (vacío: el portal vive en la raíz del subdominio) que usan
 * los `hx-*` / links.
 */

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Atajo para atributos. */
export const esc = escapeHtml

/** Toast fuera de banda: se inserta al inicio de #toast (swaps HTMX). */
export function toastOob(type, message) {
  return `<div class="toast ${escapeHtml(type)}" hx-swap-oob="afterbegin:#toast">${escapeHtml(message)}</div>`
}

export function toast(type, message) {
  return `<div class="toast ${escapeHtml(type)}">${escapeHtml(message)}</div>`
}

export function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Badge con clase según estado. */
export function statusBadge(status) {
  const map = {
    active: ['ok', 'activo'], inactive: ['', 'inactivo'], disabled: ['bad', 'deshabilitado'],
    suspended: ['warn', 'suspendido'], pending: ['warn', 'pendiente'],
    deleted: ['bad', 'eliminado'], archived: ['', 'archivado'],
    trialing: ['info', 'prueba'], past_due: ['warn', 'vencido'],
    cancelled: ['bad', 'cancelado'], canceled: ['bad', 'cancelado'],
  }
  const [cls, label] = map[status] || ['', status || '—']
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`
}

/** Iconos inline (SVG mínimos). */
export const ICONS = {
  apps: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  billing: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  config: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
  external: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  logout: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
  theme: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 3a3 3 0 0 1 0 6"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg>',
}

export function icon(name, cls = 'ico') {
  return `<span class="${cls}">${ICONS[name] || ''}</span>`
}

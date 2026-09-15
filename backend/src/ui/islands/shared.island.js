/**
 * shared.island.js — Helpers compartidos por todas las islas.
 *
 * No tiene HTML ni hydrate. Solo exports utilitarios.
 */
export function api(path, method, body) {
  return fetch(window.__SIVO__.apiBase + path, {
    method: method || 'GET',
    credentials: 'include',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(res => {
    if (!res.ok) {
      return res.json().catch(() => ({})).then(data => {
        const msg = data?.error || data?.message || ('HTTP ' + res.status)
        throw new Error(msg)
      })
    }
    return res.json().then(data => data?.data !== undefined ? data.data : data)
  })
}

export function money(n) {
  return '$' + (Number(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 })
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c])
}

export function toast(type, msg) {
  const box = document.getElementById('toast')
  if (!box) return
  const el = document.createElement('div')
  el.className = 'toast ' + type
  el.textContent = msg
  box.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

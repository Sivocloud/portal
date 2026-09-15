/**
 * theme.island.js — Toggle de tema claro/oscuro del portal.
 *
 * Hidrata en: document.documentElement
 * Botón: #theme-toggle
 */
const KEY = 'sivo-portal_theme'

export function hydrate() {
  const saved = localStorage.getItem(KEY) || 'light'
  document.documentElement.setAttribute('data-theme', saved)

  const btn = document.getElementById('theme-toggle')
  if (!btn) return
  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', cur)
    localStorage.setItem(KEY, cur)
  })
}

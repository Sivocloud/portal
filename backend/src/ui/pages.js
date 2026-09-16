/**
 * pages.js — Shell HTML del portal (sidebar + topbar + content).
 *
 * El content se renderiza server-side; HTMX reemplaza fragmentos con
 * `hx-target`. El portal vive en la raíz de su subdominio, así que `${base}`
 * es vacío y las URLs quedan absolutas a `/` (ej. `/`, `/static/app.css`).
 *
 * El nav está pensado para crecer (Facturación, Configuración, ...). Hoy
 * solo "Apps" está activo; el resto se muestra como "próximamente".
 */
import { escapeHtml, icon } from './fragments.js'

const NAV = [
  { key: 'portal', href: '/', label: 'Inicio', icon: 'apps' },
  { key: 'apps', href: '/aplicaciones', label: 'Aplicaciones', icon: 'store' },
  { key: 'billing', href: '/facturacion', label: 'Facturación', icon: 'billing' },
]

// Secciones futuras (placeholder hasta que existan los flows).
const NAV_SOON = [
  { key: 'config', label: 'Configuración', icon: 'config' },
]

function navLink(base, item, active) {
  const cls = `nav-item${active === item.key ? ' active' : ''}`
  return `<a class="${cls}" href="${base}${item.href}" hx-boost="true">${icon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`
}

function navSoon(item) {
  return `<span class="nav-item soon" title="Próximamente">${icon(item.icon)}<span>${escapeHtml(item.label)}</span></span>`
}

export function shell({
  base,
  apiBase = '',
  authBase = '',
  tenantId = '',
  user = {},
  role = '',
  active = '',
  title = 'Portal',
  contentHtml = '',
}) {
  const navMain = NAV.map((i) => navLink(base, i, active)).join('')
  const navSoonItems = NAV_SOON.map(navSoon).join('')

  const userName = user.id ? escapeHtml(String(user.id)) : '—'
  const roleLabel = escapeHtml(role || user.role || '')
  const tenantLabel = escapeHtml(tenantId || '')

  return `<!DOCTYPE html>
<html lang="es" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} · SIVOcloud</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${base}/static/app.css" />
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand"><span class="dot"></span><span>SIVOcloud Portal</span></div>
      ${navMain}
      <div class="nav-section">Próximamente</div>
      ${navSoonItems}
      <div class="spacer"></div>
      <div class="user">
        <div><strong>${userName}</strong></div>
        <div class="muted">${roleLabel}${roleLabel && tenantLabel ? ' · ' : ''}${tenantLabel}</div>
        <div class="row mt" style="gap:6px">
          <button class="btn ghost sm" id="theme-toggle" data-island="theme" title="Tema">${icon('theme')}</button>
          <form id="logout-form" method="POST" action="${escapeHtml(authBase)}/api/auth/logout" target="logout-sink" style="display:inline">
            <button class="btn ghost sm" type="submit">${icon('logout')} Salir</button>
          </form>
          <iframe name="logout-sink" title="logout" style="display:none;width:0;height:0;border:0"></iframe>
        </div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <h1>${escapeHtml(title)}</h1>
        <div id="topbar-slot"></div>
      </header>
      <div class="content">${contentHtml}</div>
    </main>
  </div>
  <div id="toast"></div>
  <script>window.__SIVO__ = ${JSON.stringify({ base, apiBase, authBase, tenantId, userId: user.id || '', role })};</script>
  <script src="${base}/static/htmx.min.js"></script>
  <script>
    window.SIVO = window.SIVO || {}
    if (window.htmx) {
      htmx.config.defaultSwapDelay = 40;
      htmx.config.historyCacheSize = 0;
    }
    // Logout: el POST va a un iframe oculto (limpia cookie en _auth) y luego
    // navegamos al login. Evita CORS preflight (form simple cross-origin).
    var lf = document.getElementById('logout-form');
    if (lf) lf.addEventListener('submit', function () {
      setTimeout(function () { window.location.href = '${escapeHtml(authBase)}/login'; }, 600);
    });
    document.body.addEventListener('htmx:afterSwap', function () {
      document.querySelectorAll('#toast .toast').forEach(function (t) {
        if (t.dataset.timer) return;
        t.dataset.timer = '1';
        setTimeout(function () { t.remove(); }, 3500);
      });
    });
  </script>
  <script>
    // ── Island bootstrapper ──────────────────────────────────────────────
    // Cada isla es un ES module real; se hidrata sólo si su root existe.
    const BASE = '${base}'
    const ISLAND_ROOTS = {
      'theme': document.getElementById('theme-toggle'),
      'paddle': document.body,
    }
    async function loadIsland(name) {
      const root = ISLAND_ROOTS[name]
      if (!root) return
      try {
        const mod = await import(BASE + '/static/islands/' + name + '.island.js')
        if (mod.hydrate) mod.hydrate(root)
      } catch (e) {
        console.error('[island]', name, e)
      }
    }
    loadIsland('theme')
    loadIsland('paddle')
  </script>
</body>
</html>`
}

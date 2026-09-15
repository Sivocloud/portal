/**
 * portal.js — Vista principal del portal: hero del tenant + apps instaladas.
 *
 * `ctx.data` = salida del nodo `portal-overview`:
 *   { valid, user?, tenant?, apps? }
 */
import { escapeHtml, statusBadge, fmtDate, icon } from '../fragments.js'

const APP_URL = {
  pos: (apps, sub) => `${apps}/sivopos/${sub}`,
  b2b: (apps, sub) => `${apps}/b2b/${sub}`,
  connect: (apps, sub) => `${apps}/connect/${sub}`,
}

function appLaunchUrl(appsBase, appBases, appSlug, subdomain) {
  const fn = APP_URL[appSlug]
  if (!fn) return null
  // En dev cada app corre en su propio puerto (`APP_BASES`); en prod no se
  // setea y cae a `APPS_BASE` (mismo host, path por app).
  const base = (appBases && appBases[appSlug]) || appsBase
  return fn(base, subdomain)
}

function invalidCard(base, authBase) {
  return {
    title: 'Sesión inválida',
    active: 'portal',
    layout: 'app',
    html: `<div class="card"><div class="card-body">
      <h2 class="mb">Sesión inválida o expirada</h2>
      <p class="muted">Volvé a iniciar sesión para continuar.</p>
      <div class="mt"><a class="btn primary" href="${escapeHtml(authBase)}/login">Ir al login</a></div>
    </div></div>`,
  }
}

export function portalView(ctx) {
  const data = ctx.data || {}
  const base = ctx.base || ''
  const authBase = ctx.authBase || 'https://auth.sivocloud.dev'
  const appsBase = ctx.appsBase || 'https://apps.sivocloud.dev'
  const appBases = ctx.appBases || {}

  if (!data.valid) return invalidCard(base, authBase)

  const tenant = data.tenant || {}
  const apps = Array.isArray(data.apps) ? data.apps : []
  const tenantName = tenant.displayName || tenant.id || '—'
  const subdomain = tenant.subdomain || tenant.id || ''

  const hero = `
<div class="hero">
  <h1>${escapeHtml(tenantName)}</h1>
  <div class="sub">
    ${tenant.plan ? `<span class="muted">plan</span> <span class="badge info">${escapeHtml(tenant.plan)}</span>` : ''}
    ${tenant.defaultCurrency ? `<span class="muted">· ${escapeHtml(tenant.defaultCurrency)}</span>` : ''}
    ${tenant.region ? `<span class="muted">· ${escapeHtml(tenant.region)}</span>` : ''}
  </div>
  <div class="mt small muted">Tu cuenta existe en ${apps.length} app${apps.length === 1 ? '' : 's'} instalada${apps.length === 1 ? '' : 's'}.</div>
</div>`

  const body = apps.length === 0
    ? `<div class="card"><div class="empty">No hay apps instaladas todavía.</div></div>`
    : `<div class="app-grid">
${apps.map((app) => {
      const url = appLaunchUrl(appsBase, appBases, app.appSlug, subdomain)
      const open = app.status === 'active' && url
      return `  <div class="app-card">
    <h3>${escapeHtml(app.appSlug || '—')} ${statusBadge(app.status)}</h3>
    <div class="db">${escapeHtml(app.dbName || '')}</div>
    <div class="meta">meter: ${escapeHtml(app.meteringMode || '—')} · instalado: ${escapeHtml(fmtDate(app.installedAt))}</div>
    <div class="actions">
      ${open
        ? `<a class="btn primary sm" href="${escapeHtml(url)}">${icon('external')} Abrir</a>`
        : `<button class="btn sm" disabled>No disponible</button>`}
    </div>
  </div>`
    }).join('\n')}
</div>`

  const info = `
<details class="info-box mt">
  <summary>Info técnica (zero-secrets)</summary>
  <p>Este worker NO tiene secrets de plataforma. Toda la metadata llega vía Service Binding RPC <code>env.AUTH</code>.</p>
  <ul>
    <li>Sin TURSO_CONTROL_PLANE_TOKEN</li>
    <li>Sin CONTROL_PLANE_ENCRYPTION_KEY</li>
    <li>Sin D1 binding de plataforma</li>
    <li>Sin SESSION_SECRET (verificación vía RPC)</li>
  </ul>
</details>`

  return {
    title: 'Apps',
    active: 'portal',
    layout: 'app',
    html: hero + body + info,
  }
}

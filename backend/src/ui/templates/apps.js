/**
 * apps.js — Vista "Aplicaciones": apps del tenant + catálogo instalable.
 *
 * `ctx.data` = salida del nodo `portal-apps-catalog`:
 *   { valid, canManage, role, catalog[], installed[] }
 *
 * Desinstalar / reinstalar hacen `hx-post` a `/aplicaciones/toggle` y swapean
 * `#apps-body` con la vista re-renderizada (layout none) + un toast OOB.
 *
 * Instalar una app nueva NO está disponible: requiere provisionar la DB del
 * tenant (hoy manual/out-of-band), así que el catálogo es informativo.
 */
import { escapeHtml, statusBadge, fmtDate, fmtMoney } from '../fragments.js'

const DAY_MS = 24 * 60 * 60 * 1000

function invalidCard(authBase) {
  return {
    title: 'Aplicaciones',
    active: 'apps',
    layout: 'app',
    html: `<div class="card"><div class="card-body">
      <h2 class="mb">No disponible</h2>
      <p class="muted">No pudimos cargar tus aplicaciones. Volvé a iniciar sesión o contactá a soporte.</p>
      <div class="mt"><a class="btn primary" href="${escapeHtml(authBase)}/login">Ir al login</a></div>
    </div></div>`,
  }
}

function daysLeft(purgeAfter) {
  if (!purgeAfter) return null
  return Math.max(0, Math.ceil((Number(purgeAfter) - Date.now()) / DAY_MS))
}

function actionButton(app, canManage) {
  if (!canManage) return ''
  if (app.status === 'deleted') {
    return `<button class="btn primary sm"
      hx-post="/aplicaciones/toggle?action=reactivate&appSlug=${encodeURIComponent(app.appSlug)}"
      hx-target="#apps-body" hx-swap="outerHTML">Reinstalar</button>`
  }
  if (app.status === 'active') {
    return `<button class="btn sm danger"
      hx-post="/aplicaciones/toggle?action=uninstall&appSlug=${encodeURIComponent(app.appSlug)}"
      hx-target="#apps-body" hx-swap="outerHTML"
      hx-confirm="¿Desinstalar ${escapeHtml(app.appSlug)}? Dejará de facturarse. Podés reinstalarla dentro de la ventana de retención.">Desinstalar</button>`
  }
  return ''
}

function installedSection(data, currency) {
  const installed = data.installed || []
  if (installed.length === 0) {
    return `<div class="empty">No tenés apps instaladas todavía.</div>`
  }
  const cards = installed.map((app) => {
    const product = (data.catalog || []).find((c) => c.appSlug === app.appSlug)
    const name = product?.name || app.appSlug
    const price = product ? `${fmtMoney(product.priceCents, product.currency || currency)} / ${escapeHtml(product.recurrence || 'mes')}` : '—'
    const left = daysLeft(app.purgeAfter)
    const purge = app.status === 'deleted'
      ? `<div class="notice warn mt">
          <strong>Pendiente de eliminación</strong>
          <div class="small">Se eliminará definitivamente ${left != null ? `en ${left} día${left === 1 ? '' : 's'}` : 'pronto'}. Reinstalá para conservar los datos.</div>
        </div>`
      : ''
    return `<div class="app-card">
      <div class="row between">
        <h3>${escapeHtml(name)} ${statusBadge(app.status)}</h3>
        <span class="muted small">${price}</span>
      </div>
      <div class="db">${escapeHtml(app.dbName || '')}</div>
      <div class="meta">instalado: ${escapeHtml(fmtDate(app.installedAt))}${app.deletedAt ? ` · desinstalado: ${escapeHtml(fmtDate(app.deletedAt))}` : ''}</div>
      ${purge}
      <div class="actions">${actionButton(app, data.canManage)}</div>
    </div>`
  }).join('\n')
  return `<div class="app-grid">${cards}</div>`
}

function catalogSection(data, currency) {
  const catalog = data.catalog || []
  const installedBy = new Map((data.installed || []).map((a) => [a.appSlug, a]))
  if (catalog.length === 0) {
    return `<div class="empty">No hay apps en el catálogo.</div>`
  }
  const rows = catalog.map((p) => {
    const inst = installedBy.get(p.appSlug)
    const status = inst ? statusBadge(inst.status) : `<span class="badge">no instalada</span>`
    const metered = p.metered && p.metered.length
      ? p.metered.map((m) => `${m.included} ${escapeHtml(String(m.code).split('.').pop())} incl.`).join(' · ')
      : ''
    return `<tr>
      <td>
        ${escapeHtml(p.name)}
        ${p.description ? `<div class="small muted">${escapeHtml(p.description)}</div>` : ''}
        ${metered ? `<div class="small muted">${metered}</div>` : ''}
      </td>
      <td class="num">${fmtMoney(p.priceCents, p.currency || currency)} / ${escapeHtml(p.recurrence || 'mes')}</td>
      <td>${status}</td>
    </tr>`
  }).join('\n')
  return `<table class="tbl">
    <thead><tr><th>App</th><th class="num">Precio</th><th>Estado</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

export function appsView(ctx) {
  const data = ctx.data || {}
  const authBase = ctx.authBase || 'https://auth.sivocloud.dev'
  if (!data.valid) return invalidCard(authBase)

  const currency = 'USD'
  const installedCount = (data.installed || []).filter((a) => a.status === 'active').length
  const catalogCount = (data.catalog || []).length

  const hero = `<div class="hero">
    <h1>Aplicaciones</h1>
    <div class="sub">${installedCount} de ${catalogCount} apps activas</div>
  </div>`

  const body = `<div id="apps-body">
${hero}

<div class="card">
  <div class="card-head">Tus apps</div>
  <div class="card-body">${installedSection(data, currency)}</div>
</div>

<div class="card">
  <div class="card-head">Catálogo</div>
  <div class="card-body">
    ${catalogSection(data, currency)}
    <p class="small muted mt">¿Querés sumar una app? La instalación se coordina con SIVOCLOUD (implica provisionar tu base de datos).</p>
  </div>
</div>
</div>`

  return {
    title: 'Aplicaciones',
    active: 'apps',
    layout: 'app',
    html: body,
  }
}

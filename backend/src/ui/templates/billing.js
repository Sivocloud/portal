/**
 * billing.js — Vista "Facturación": suscripción, consumo del período y facturas.
 *
 * `ctx.data` = salida del nodo `portal-billing`:
 *   { valid, canManage, role, subscription, items[], estimate,
 *     usage: { period, lines[], totals }, invoices[] }
 *
 * Los writes (soporte / auto-renovación) hacen `hx-post` a
 * `/facturacion/<acción>` y swapean `#billing-body` con la vista re-renderizada
 * (layout none) + un toast OOB.
 */
import { escapeHtml, statusBadge, fmtDate, fmtMoney, fmtPeriod, icon } from '../fragments.js'

function invalidCard(authBase) {
  return {
    title: 'Facturación',
    active: 'billing',
    layout: 'app',
    html: `<div class="card"><div class="card-body">
      <h2 class="mb">No disponible</h2>
      <p class="muted">No pudimos cargar tu facturación. Volvé a iniciar sesión o contactá a soporte.</p>
      <div class="mt"><a class="btn primary" href="${escapeHtml(authBase)}/login">Ir al login</a></div>
    </div></div>`,
  }
}

function kpis(data) {
  const sub = data.subscription || {}
  const est = data.estimate || {}
  const totals = (data.usage && data.usage.totals) || {}
  const currency = est.currency || totals.currency || 'USD'
  const period = (data.usage && data.usage.period) || {}
  return `<div class="kpi-grid">
  <div class="kpi">
    <div class="label">Estado</div>
    <div class="value">${statusBadge(sub.status || '—')}</div>
    <div class="hint">${sub.cancelAtPeriodEnd ? 'Se cancela al fin del período' : 'Renovación automática'}</div>
  </div>
  <div class="kpi">
    <div class="label">Próximo cobro estimado</div>
    <div class="value">${fmtMoney(est.totalCents, currency)}</div>
    <div class="hint">${fmtMoney(est.recurringCents, currency)} fijo + ${fmtMoney(est.usageCents, currency)} consumo</div>
  </div>
  <div class="kpi">
    <div class="label">Consumo del período</div>
    <div class="value">${fmtMoney(totals.usageCents, currency)}</div>
    <div class="hint">${escapeHtml(fmtPeriod(period.start, period.end))}</div>
  </div>
</div>`
}

function itemsTable(items, currency) {
  if (!items || items.length === 0) {
    return `<div class="empty">No hay conceptos facturables todavía.</div>`
  }
  const rows = items.map((it) => {
    const typeLabel = it.type === 'metered_op'
      ? `${icon('billing')} por uso`
      : (it.recurrence === 'monthly' ? 'mensual' : (it.recurrence || '—'))
    const price = it.type === 'metered_op'
      ? `${fmtMoney(it.overageUnitPriceCents, it.currency || currency)} / op`
      : `${fmtMoney(it.unitPriceCents, it.currency || currency)} / mes`
    const franquicia = it.includedQuantity > 0 ? `${it.includedQuantity} incl.` : '—'
    return `<tr>
      <td>${escapeHtml(it.name)}${it.productCode ? `<div class="small muted">${escapeHtml(it.productCode)}</div>` : ''}</td>
      <td>${typeLabel}</td>
      <td class="num">${price}</td>
      <td class="num">${escapeHtml(franquicia)}</td>
    </tr>`
  }).join('\n')
  return `<table class="tbl">
    <thead><tr><th>Concepto</th><th>Tipo</th><th class="num">Precio</th><th class="num">Franquicia</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function supportControls(data, currency) {
  const items = data.items || []
  const support = items.find((it) => String(it.productCode || '').startsWith('support:'))
  const current = support ? String(support.productCode).split(':')[1] : null
  const opts = [
    { code: null, label: 'Sin soporte' },
    { code: 'standard', label: 'Estándar · $50' },
    { code: 'premium', label: 'Premium · $100' },
  ]
  const btns = opts.map((o) => {
    const active = (o.code || null) === current
    const q = o.code ? `?planCode=${o.code}` : '?planCode=none'
    return `<button class="${active ? 'active' : ''}"
      hx-post="/facturacion/soporte${q}"
      hx-target="#billing-body"
      hx-swap="outerHTML">${escapeHtml(o.label)}</button>`
  }).join('\n')
  return `<div class="row between mt">
    <div>
      <div class="small muted mb">Plan de soporte SIVOCLOUD</div>
      <div class="pill-group">${btns}</div>
    </div>
  </div>`
}

function autoRenewControls(data) {
  const sub = data.subscription || {}
  const on = !sub.cancelAtPeriodEnd
  const btn = on
    ? `<button class="btn" hx-post="/facturacion/autorenew?enabled=false" hx-target="#billing-body" hx-swap="outerHTML">Desactivar auto-renovación</button>`
    : `<button class="btn primary" hx-post="/facturacion/autorenew?enabled=true" hx-target="#billing-body" hx-swap="outerHTML">Reactivar auto-renovación</button>`
  return `<div class="row between mt">
    <div class="small muted">${on ? 'Tu suscripción se renueva automáticamente cada período.' : 'Tu suscripción no se renovará al final del período.'}</div>
    <div>${btn}</div>
  </div>`
}

function paddleControls(data) {
  if (!data.canManage) return ''
  const sub = data.subscription || {}
  if (sub.paddleSubscriptionId) {
    const status = sub.paddleStatus || 'active'
    return `<div class="row between mt">
    <div>
      <div class="small muted mb">Pago con Paddle</div>
      <div>${statusBadge(status)} <span class="small muted">${escapeHtml(sub.paddleSubscriptionId)}</span></div>
    </div>
    <div><button class="btn" data-paddle-action="portal">Gestionar suscripción</button></div>
  </div>`
  }
  return `<div class="row between mt">
    <div class="small muted">Activá el cobro automático de la suscripción con Paddle.</div>
    <div><button class="btn primary" data-paddle-action="checkout" data-kind="subscription">Suscribirme con Paddle</button></div>
  </div>`
}

function walletSection(data, currency) {
  if (!data.canManage) return ''
  const packs = [
    { cents: 2000, label: '$20' },
    { cents: 5000, label: '$50' },
    { cents: 10000, label: '$100' },
  ]
  const btns = packs.map((p) => `<button class="btn"
      data-paddle-action="checkout"
      data-kind="wallet"
      data-amount-cents="${p.cents}"
      data-currency="${escapeHtml(currency)}"
      data-description="Saldo prepago SIVOCLOUD">${p.label}</button>`).join('\n')
  const balance = data.wallet && data.wallet.balanceCents != null
    ? fmtMoney(data.wallet.balanceCents, currency)
    : '—'
  return `<div class="card">
  <div class="card-head"><span>Saldo prepago</span><span class="badge info">${escapeHtml(balance)}</span></div>
  <div class="card-body">
    <p class="small muted mb">Cargá saldo para pagar cargos y servicios puntuales (consultoría, configuración).</p>
    <div class="pill-group">${btns}</div>
  </div>
</div>`
}

function usageSection(data, currency) {
  const lines = (data.usage && data.usage.lines) || []
  if (lines.length === 0) {
    return `<div class="empty">Sin consumo registrado en este período.</div>`
  }
  const rows = lines.map((l) => {
    const pct = l.includedQuantity > 0
      ? Math.min(100, Math.round((l.quantity / l.includedQuantity) * 100))
      : (l.billableQuantity > 0 ? 100 : 0)
    const over = l.billableQuantity > 0
    return `<tr>
      <td>
        ${escapeHtml(l.name)}
        ${l.includedQuantity > 0 ? `<div class="progress"><span style="width:${pct}%;${over ? 'background:var(--warning)' : ''}"></span></div>` : ''}
      </td>
      <td class="num">${l.quantity}</td>
      <td class="num">${l.includedQuantity || 0}</td>
      <td class="num">${l.billableQuantity}</td>
      <td class="num">${fmtMoney(l.estimatedCents, currency)}</td>
    </tr>`
  }).join('\n')
  return `<table class="tbl">
    <thead><tr><th>Métrica</th><th class="num">Consumo</th><th class="num">Incluido</th><th class="num">Excedente</th><th class="num">Estimado</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function invoicesSection(invoices, currency) {
  if (!invoices || invoices.length === 0) {
    return `<div class="empty">Todavía no hay facturas emitidas.</div>`
  }
  const rows = invoices.map((inv) => `<tr>
    <td>${escapeHtml(inv.number)}</td>
    <td>${statusBadge(inv.status)}</td>
    <td>${escapeHtml(fmtPeriod(inv.periodStart, inv.periodEnd))}</td>
    <td>${escapeHtml(fmtDate(inv.dueAt))}</td>
    <td class="num">${fmtMoney(inv.totalCents, inv.currency || currency)}</td>
  </tr>`).join('\n')
  return `<table class="tbl">
    <thead><tr><th>Número</th><th>Estado</th><th>Período</th><th>Vence</th><th class="num">Total</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

export function billingView(ctx) {
  const data = ctx.data || {}
  const authBase = ctx.authBase || 'https://auth.sivocloud.dev'
  if (!data.valid) return invalidCard(authBase)

  const sub = data.subscription
  const currency = (data.estimate && data.estimate.currency) || 'USD'

  if (!sub) {
    return {
      title: 'Facturación',
      active: 'billing',
      layout: 'app',
      html: `<div id="billing-body">
${kpis(data)}
<div class="card"><div class="card-head">Suscripción</div><div class="card-body">
  <div class="empty">Todavía no tenés una suscripción activa. Instalá una app para comenzar.</div>
</div></div>
</div>`,
    }
  }

  const manageNote = data.canManage
    ? ''
    : `<p class="small muted mt">Solo el dueño de la cuenta puede modificar el soporte y la renovación.</p>`

  const body = `<div id="billing-body">
${kpis(data)}

<div class="card">
  <div class="card-head"><span>Suscripción</span><span class="badge info">${escapeHtml(currency)} · ${escapeHtml(fmtPeriod(sub.periodStart, sub.periodEnd))}</span></div>
  <div class="card-body">
    ${itemsTable(data.items, currency)}
    ${data.canManage ? supportControls(data, currency) : ''}
    ${data.canManage ? autoRenewControls(data) : ''}
    ${paddleControls(data)}
    ${manageNote}
  </div>
</div>

${walletSection(data, currency)}

<div class="card">
  <div class="card-head"><span>Consumo del período</span><span class="muted small">${escapeHtml(fmtPeriod((data.usage && data.usage.period || {}).start, (data.usage && data.usage.period || {}).end))}</span></div>
  <div class="card-body">
    ${usageSection(data, currency)}
  </div>
</div>

<div class="card">
  <div class="card-head">Facturas</div>
  <div class="card-body">
    ${invoicesSection(data.invoices, currency)}
  </div>
</div>
</div>`

  return {
    title: 'Facturación',
    active: 'billing',
    layout: 'app',
    html: body,
  }
}

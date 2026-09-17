/**
 * paddle.ts — isla de Paddle: abre el Checkout (overlay) y el Customer Portal.
 *
 * El server crea la transacción (nunca el browser): la isla pide
 * `POST /api/facturacion/checkout` (o `/portal`) y usa el `transactionId`
 * devuelto para abrir el overlay con Paddle.js.
 *
 * Delegación a nivel documento: cualquier elemento con `data-paddle-action`
 * funciona sin re-hidratar.
 *   <button data-paddle-action="checkout" data-kind="subscription">
 *   <button data-paddle-action="checkout" data-kind="wallet"
 *           data-amount-cents="2000" data-description="..." data-service-code="...">
 *   <button data-paddle-action="portal">
 *
 * Es la única isla del portal: se bundelea con Astro (archivo hasheado →
 * CSP-safe, sin inline).
 */
const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let paddleInitPromise: Promise<void> | null = null
let paddleToken: string | null = null

function toast(type: string, msg: string): void {
  const box = document.getElementById('toast')
  if (!box) return
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  box.appendChild(el)
  setTimeout(() => el.remove(), 3500)
}

function handlePaddleEvent(ev: any): void {
  const name = ev?.name
  if (!name) return
  if (name === 'checkout.completed') {
    console.info('[paddle]', name, ev)
    toast('success', 'Pago completado. Actualizando…')
    setTimeout(() => window.location.reload(), 1200)
    return
  }
  if (name === 'checkout.error' || name === 'checkout.payment.error' || name === 'checkout.payment.failed') {
    console.error('[paddle]', name, ev)
    toast('error', ev?.detail || ev?.code || 'Paddle rechazó el checkout.')
    return
  }
  if (name === 'checkout.warning') {
    console.warn('[paddle]', name, ev)
    return
  }
  console.info('[paddle]', name)
}

async function ensurePaddle(clientConfig: any): Promise<void> {
  if (!clientConfig?.enabled || !clientConfig.clientToken) {
    throw new Error('Paddle no está configurado.')
  }
  if (paddleInitPromise && paddleToken === clientConfig.clientToken) return paddleInitPromise

  paddleInitPromise = (async () => {
    if (!(window as any).Paddle) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = PADDLE_JS
        s.onload = () => resolve()
        s.onerror = () => reject(new Error('No se pudo cargar Paddle.js'))
        document.head.appendChild(s)
      })
    }
    const Paddle = (window as any).Paddle
    if (clientConfig.environment === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Initialize({ token: clientConfig.clientToken, eventCallback: handlePaddleEvent })
    paddleToken = clientConfig.clientToken
  })()

  return paddleInitPromise
}

async function postJSON(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json().catch(() => ({}))
}

function checkoutError(res: any): string {
  const reason = res?.reason
  if (reason === 'paddle_not_configured') return 'El pago todavía no está habilitado.'
  if (reason === 'no_billable_items') return 'No hay conceptos facturables para suscribir.'
  if (reason === 'missing_price_ids') {
    const codes = Array.isArray(res.missingPriceIds) ? res.missingPriceIds.join(', ') : ''
    return `Falta configurar el precio en Paddle${codes ? ` (${codes})` : ''}. Contactanos para habilitarlo.`
  }
  if (reason === 'missing_custom_product') return 'Falta configurar el producto de cargos puntuales.'
  if (reason === 'no_customer_email') return 'Necesitamos un email de facturación en tu cuenta.'
  return res?.error || 'No pudimos iniciar el pago. Probá de nuevo.'
}

async function openCheckout(el: HTMLElement): Promise<void> {
  const kind = el.getAttribute('data-kind') || 'subscription'
  const body: any = { kind }
  if (kind === 'wallet') {
    body.amountCents = Number(el.getAttribute('data-amount-cents')) || 0
    body.currency = el.getAttribute('data-currency') || 'USD'
    body.description = el.getAttribute('data-description') || undefined
    body.serviceCode = el.getAttribute('data-service-code') || undefined
  } else if (el.getAttribute('data-subscription-id')) {
    body.subscriptionId = el.getAttribute('data-subscription-id')
  }

  const res = await postJSON('/api/facturacion/checkout', body)
  if (!res || res.ok !== true) {
    toast('error', checkoutError(res))
    return
  }
  if (!res.transactionId) {
    toast('error', 'No pudimos crear la transacción. Probá de nuevo.')
    return
  }
  await ensurePaddle(res.clientConfig)
  try {
    ;(window as any).Paddle.Checkout.open({
      transactionId: res.transactionId,
      settings: { displayMode: 'overlay' },
    })
  } catch (err: any) {
    console.error('[paddle] Checkout.open falló', err)
    toast('error', err?.message || 'No pudimos abrir el checkout.')
  }
}

async function openPortal(): Promise<void> {
  const res = await postJSON('/api/facturacion/portal', {})
  if (!res || res.ok !== true || !res.url) {
    toast('error', 'No pudimos abrir la gestión de suscripción. Probá de nuevo.')
    return
  }
  window.location.href = res.url
}

document.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement | null)?.closest('[data-paddle-action]') as HTMLElement | null
  if (!el) return
  const action = el.getAttribute('data-paddle-action')
  if (action === 'portal-link') return // deja navegar

  ev.preventDefault()
  if (el.dataset.busy === '1') return
  el.dataset.busy = '1'
  const done = () => { delete el.dataset.busy }

  if (action === 'portal') { openPortal().finally(done); return }
  if (action === 'checkout') { openCheckout(el).finally(done); return }
  done()
})

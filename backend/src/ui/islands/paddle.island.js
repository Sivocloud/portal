/**
 * paddle.island.js — Abre Paddle Checkout (overlay) y el Customer Portal.
 *
 * El server crea la transacción (nunca el browser): el island sólo pide
 * `POST /_ui/facturacion/checkout` (o `/portal`) y usa el `transactionId`
 * devuelto para abrir el overlay con Paddle.js.
 *
 * Delegación a nivel documento: sobrevive los swaps de HTMX (billing-body).
 *
 * Botones reconocidos (cualquier elemento con `data-paddle-action`):
 *   <button data-paddle-action="checkout" data-kind="subscription">
 *   <button data-paddle-action="checkout" data-kind="wallet"
 *           data-amount-cents="2000" data-description="..." data-service-code="...">
 *   <button data-paddle-action="portal">
 *   <a     data-paddle-action="portal-link" href="...">  (link directo)
 */
import { api, toast } from './shared.island.js'

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let bound = false
let paddleInitPromise = null
let paddleToken = null

/**
 * Paddle.js emite `checkout.error` (bloqueante) y `checkout.warning` (no
 * bloqueante). Sin esto, un fallo queda invisible dentro del iframe
 * ("Something went wrong"). En dev logueamos todo; al usuario le mostramos
 * el `detail` del error. `checkout.completed` recarga para reflejar el estado.
 */
function handlePaddleEvent(ev) {
  const name = ev && ev.name
  if (!name) return
  if (name === 'checkout.completed') {
    console.info('[paddle]', name, ev)
    toast('success', 'Pago completado. Actualizando…')
    setTimeout(() => window.location.reload(), 1200)
    return
  }
  if (name === 'checkout.error' || name === 'checkout.payment.error' || name === 'checkout.payment.failed') {
    console.error('[paddle]', name, ev)
    toast('error', (ev && ev.detail) || (ev && ev.code) || 'Paddle rechazó el checkout.')
    return
  }
  if (name === 'checkout.warning') {
    console.warn('[paddle]', name, ev)
    return
  }
  console.info('[paddle]', name)
}

export function hydrate() {
  if (bound) return
  bound = true

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-paddle-action]')
    if (!el) return
    const action = el.getAttribute('data-paddle-action')

    if (action === 'portal-link') return // deja navegar

    ev.preventDefault()
    if (el.dataset.busy === '1') return
    el.dataset.busy = '1'

    if (action === 'portal') {
      openPortal(el).finally(() => { delete el.dataset.busy })
      return
    }
    if (action === 'checkout') {
      openCheckout(el).finally(() => { delete el.dataset.busy })
      return
    }
    delete el.dataset.busy
  })
}

async function ensurePaddle(clientConfig) {
  if (!clientConfig?.enabled || !clientConfig.clientToken) {
    throw new Error('Paddle no está configurado.')
  }
  if (paddleInitPromise && paddleToken === clientConfig.clientToken) return paddleInitPromise

  paddleInitPromise = (async () => {
    if (!window.Paddle) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = PADDLE_JS
        s.onload = resolve
        s.onerror = () => reject(new Error('No se pudo cargar Paddle.js'))
        document.head.appendChild(s)
      })
    }
    if (clientConfig.environment === 'sandbox') window.Paddle.Environment.set('sandbox')
    window.Paddle.Initialize({ token: clientConfig.clientToken, eventCallback: handlePaddleEvent })
    paddleToken = clientConfig.clientToken
  })()

  return paddleInitPromise
}

async function openCheckout(el) {
  const kind = el.getAttribute('data-kind') || 'subscription'
  const body = { kind }
  if (kind === 'wallet') {
    body.amountCents = Number(el.getAttribute('data-amount-cents')) || 0
    body.currency = el.getAttribute('data-currency') || 'USD'
    body.description = el.getAttribute('data-description') || undefined
    body.serviceCode = el.getAttribute('data-service-code') || undefined
  } else if (el.getAttribute('data-subscription-id')) {
    body.subscriptionId = el.getAttribute('data-subscription-id')
  }

  const res = await api('/_ui/facturacion/checkout', 'POST', body)
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
    window.Paddle.Checkout.open({
      transactionId: res.transactionId,
      settings: { displayMode: 'overlay' },
    })
  } catch (err) {
    console.error('[paddle] Checkout.open falló', err)
    toast('error', err && err.message ? err.message : 'No pudimos abrir el checkout.')
  }
}

async function openPortal() {
  const res = await api('/_ui/facturacion/portal', 'POST', {})
  if (!res || res.ok !== true || !res.url) {
    toast('error', 'No pudimos abrir la gestión de suscripción. Probá de nuevo.')
    return
  }
  window.location.href = res.url
}

function checkoutError(res) {
  const reason = res && res.reason
  if (reason === 'paddle_not_configured') return 'El pago todavía no está habilitado.'
  if (reason === 'no_billable_items') return 'No hay conceptos facturables para suscribir.'
  if (reason === 'missing_custom_product') return 'Falta configurar el producto de cargos puntuales.'
  if (reason === 'no_customer_email') return 'Necesitamos un email de facturación en tu cuenta.'
  return res && res.error ? res.error : 'No pudimos iniciar el pago. Probá de nuevo.'
}

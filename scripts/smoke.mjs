#!/usr/bin/env node
/**
 * scripts/smoke.mjs — smoke del portal en Chrome headless.
 *
 * Verifica lo que ningún curl puede: CSP (header + 0 violaciones), CSS
 * aplicado, render server-side con datos REALES, la isla de Paddle cargando
 * bajo CSP y el toggle de tema.
 *
 * Corre contra un build (`astro build` + `astro preview`, o `wrangler dev`)
 * — en `astro dev` Astro NO emite el header CSP, así que el assert de CSP
 * falla a propósito para no dar un falso verde.
 *
 * Uso:
 *   BASE=https://localhost:3036 bun run smoke
 *   BASE=https://localhost:3036 DOC=1234567 PIN=9999 bun run smoke
 *
 * Requiere Chrome (CHROME_PATH) y el server levantado.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'https://localhost:3036'
const AUTH_BASE = process.env.AUTH_BASE || 'http://localhost:3031'
const DOC = process.env.DOC || '1234567'
const PIN = process.env.PIN || '9999'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const fails = []
function check(name, ok, extra = '') {
  console.log(`  ${ok ? '✓' : '✖'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (!ok) fails.push(name)
}

async function sessionCookie() {
  const res = await fetch(`${AUTH_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documentNumber: DOC, pin: PIN }),
    redirect: 'manual',
  })
  const raw = res.headers.get('set-cookie') || ''
  const m = raw.match(/sivocloud_session=([^;]+)/)
  if (!m) throw new Error(`login sin cookie (HTTP ${res.status})`)
  return m[1]
}

const cookie = await sessionCookie()
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--ignore-certificate-errors'],
})
const host = new URL(BASE).hostname
await browser.setCookie({ name: 'sivocloud_session', value: cookie, domain: host, path: '/' })

const pages = [
  { path: '/', expect: ['Aplicaciones', 'Facturación'] },
  { path: '/aplicaciones', expect: ['Catálogo', 'Tus apps'] },
  { path: '/facturacion', expect: ['Suscripción', 'Consumo del período'] },
]

for (const { path, expect } of pages) {
  const page = await browser.newPage()
  const cspViolations = []
  const consoleErrors = []
  await page.evaluateOnNewDocument(() => {
    window.__CSP__ = []
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__CSP__.push({ directive: e.effectiveDirective, blocked: e.blockedURI })
    })
  })
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })

  const url = `${BASE}${path}`
  const res = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
  const status = res?.status()
  const headers = res?.headers() || {}
  const csp = headers['content-security-policy'] || ''

  const body = await page.evaluate(() => document.body.innerText)
  // El fondo lo pinta `html` (body es transparente) — mirá el root.
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

  console.log(`\n${url} → HTTP ${status}\n`)
  check('responde 200', status === 200, String(status))
  check('header CSP con hashes', csp.includes('sha256-'), csp ? 'ok' : 'AUSENTE')
  check('script-src permite Paddle', csp.includes('https://cdn.paddle.com'))
  check('CSS aplica', bg !== 'rgba(0, 0, 0, 0)' && bg !== '', `bg=${bg}`)
  check('render server-side con datos', expect.every((t) => body.includes(t)), expect.join(', '))

  const violations = await page.evaluate(() => window.__CSP__ || [])
  check('0 violaciones de CSP', violations.length === 0, violations.map((v) => `${v.directive}←${v.blocked}`).join(', '))
  const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e))
  check('consola sin errores', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))

  await page.close()
}

// Isla de Paddle: el módulo carga (sin 404) y el toggle de tema responde.
{
  const page = await browser.newPage()
  const failed = []
  page.on('requestfailed', (r) => { if (/\/_astro\/.*\.js/.test(r.url())) failed.push(r.url()) })
  await page.goto(`${BASE}/facturacion`, { waitUntil: 'networkidle0', timeout: 30000 })
  check('isla bundleada sin 404', failed.length === 0, failed.join(', '))
  check('CTAs de Paddle presentes', (await page.$$('[data-paddle-action="checkout"]')).length > 0)

  const before = await page.evaluate(() => document.documentElement.dataset.theme)
  await page.click('#theme-toggle')
  await new Promise((r) => setTimeout(r, 150))
  const after = await page.evaluate(() => document.documentElement.dataset.theme)
  check('toggle de tema (script bundleado)', before !== after, `${before} → ${after}`)
  await page.close()
}

// Actions: POST del form (zero-JS) → PRG → toast, con el estado restaurado.
// Es el patrón más fácil de romper en silencio (si el middleware deja de
// interceptar, el POST renderiza la página y el aviso no aparece).
{
  const page = await browser.newPage()
  await page.goto(`${BASE}/facturacion`, { waitUntil: 'networkidle0', timeout: 30000 })

  const clickAndToast = async () => {
    const btn = await page.$('form[action*="_action=setAutoRenew"] button')
    if (!btn) return null
    await btn.click()
    // El submit puede ser nativo (navega) o interceptado por el cliente de
    // Actions (fetch + redirect): en los dos casos el resultado es el toast.
    await page.waitForSelector('#toast .toast', { timeout: 15000 }).catch(() => {})
    const text = await page
      .$eval('#toast .toast', (el) => el.textContent.trim())
      .catch(() => null)
    // El toast se auto-descarta a los 3.5 s; lo saco para que el próximo read
    // no lea el anterior.
    await page.evaluate(() => document.querySelector('#toast .toast')?.remove())
    return text
  }

  const first = await clickAndToast()
  check('Action setAutoRenew → PRG + toast', !!first, first || 'sin toast')
  const url = page.url()
  check('PRG vuelve a la URL canónica', new URL(url).pathname === '/facturacion', url)

  // Deshace el cambio (el smoke no debe mutar el tenant).
  const second = await clickAndToast()
  check('Action idempotente (estado restaurado)', !!second, second || 'sin toast')
  await page.close()
}

await browser.close()
console.log(`\n${fails.length === 0 ? 'TODO VERDE' : `${fails.length} FALLA(S): ${fails.join(', ')}`}\n`)
process.exit(fails.length === 0 ? 0 : 1)

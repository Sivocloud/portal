/**
 * backend/server.js — Dev server (Bun). Sirve TODO en la raíz (`/`).
 *
 * Server-rendered (HTMX): el backend sirve la UI (páginas + fragmentos),
 * los assets estáticos y la API JSON. No hay vite ni proceso de frontend.
 *
 * En prod el portal corre en `panel.sivocloud.dev/` (subdominio propio);
 * dev replica esa raíz en `http://localhost:3034/` — mismo path (sin prefijo),
 * así el código de las vistas no cambia entre entornos.
 *
 * TLS opcional en dev: Paddle.js (checkout overlay) exige un **secure
 * context** (HTTPS). Si `DEV_TLS_CERT` + `DEV_TLS_KEY` están seteados, se
 * sirve HTTPS con esos certs (mkcert → confiados, sin warning del browser).
 * Las rutas relativas se resuelven contra este directorio (`backend/`).
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from './app.js'
import { getEnv } from './src/lib/env.mjs'

const port = Number(getEnv().PORT || process.env.PORT) || 3034

function resolveDev(file) {
  return path.isAbsolute(file) ? file : path.resolve(import.meta.dir, file)
}

function getTlsOptions() {
  const env = getEnv()
  const certFile = env.DEV_TLS_CERT || process.env.DEV_TLS_CERT
  const keyFile = env.DEV_TLS_KEY || process.env.DEV_TLS_KEY
  if (!certFile || !keyFile) return null
  const cert = resolveDev(certFile)
  const key = resolveDev(keyFile)
  if (!existsSync(cert) || !existsSync(key)) {
    console.warn(`[portal] DEV_TLS_CERT/KEY seteados pero faltan archivos (${cert} / ${key}); sigo en HTTP`)
    return null
  }
  return { cert: Bun.file(cert), key: Bun.file(key) }
}

const tls = getTlsOptions()
const scheme = tls ? 'https' : 'http'

Bun.serve({
  port,
  ...(tls ? { tls } : {}),
  fetch(request) {
    return app.fetch(request)
  },
  ready() {
    console.log(`[portal] escuchando en ${scheme}://localhost:${port}`)
    console.log(`[portal] UI: ${scheme}://localhost:${port}/`)
  },
})

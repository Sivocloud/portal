/**
 * backend/server.js — Dev server (Bun). Sirve TODO en la raíz (`/`).
 *
 * Server-rendered (HTMX): el backend sirve la UI (páginas + fragmentos),
 * los assets estáticos y la API JSON. No hay vite ni proceso de frontend.
 *
 * En prod el portal corre en `panel.sivocloud.dev/` (subdominio propio);
 * dev replica esa raíz en `http://localhost:3034/` — mismo path (sin prefijo),
 * así el código de las vistas no cambia entre entornos.
 */

import { app } from './app.js'
import { getEnv } from './src/lib/env.mjs'

const port = Number(getEnv().PORT || process.env.PORT) || 3034

Bun.serve({
  port,
  fetch(request) {
    return app.fetch(request)
  },
  ready() {
    console.log(`[portal] escuchando en http://localhost:${port}`)
    console.log(`[portal] UI: http://localhost:${port}/`)
  },
})

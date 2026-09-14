/**
 * backend/server.js — Dev server (Bun + @hono/node-server).
 *
 * Usado en dev local (`bun run dev`). En prod corre como CF Worker
 * (worker-entry.js). Mismo patrón que _controlplane/backend/server.js.
 */

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app } from './app.js'
import { getEnv } from './src/lib/env.mjs'

const PORT = Number(getEnv().PORT || 3034)

// Servir frontend estático si existe el build.
app.use('/*', serveStatic({ root: './frontend/dist' }))
app.get('*', serveStatic({ path: './frontend/dist/index.html' }))

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[portal] dev server running on http://localhost:${info.port}`)
})

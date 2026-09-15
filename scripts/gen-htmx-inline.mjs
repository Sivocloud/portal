#!/usr/bin/env bun
/**
 * gen-htmx-inline.mjs — genera `htmx-inline.mjs` desde `htmx.min.js`.
 *
 * En Cloudflare Workers no hay filesystem: no se puede `readFileSync` del
 * vendor. Generamos un módulo que exporta el source como string.
 *
 * Idempotente. Correr tras actualizar `htmx.min.js`:
 *   bun scripts/gen-htmx-inline.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'backend/src/ui/vendor/htmx.min.js')
const OUT = join(ROOT, 'backend/src/ui/vendor/htmx-inline.mjs')

const src = readFileSync(SRC, 'utf8')

const banner = `// AUTO-GENERADO por scripts/gen-htmx-inline.mjs — NO editar a mano.\n` +
  `// Fuente: backend/src/ui/vendor/htmx.min.js (${src.length} bytes).\n`

writeFileSync(OUT, `${banner}export default ${JSON.stringify(src)}\n`, 'utf8')
console.log(`✓ htmx-inline.mjs generado (${src.length} bytes) → ${OUT}`)

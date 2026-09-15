#!/usr/bin/env bun
/**
 * gen-islands-inline.mjs — inlinea los islands (JS cliente) a un módulo JS.
 *
 * En Cloudflare Workers no hay filesystem: no podemos servir los .js del
 * disco. En vez de un build step, generamos `islands-inline.mjs` que exporta
 * un objeto `{ 'nombre.island.js': "<código>" }`, servible desde Hono en dev y prod.
 *
 * Solo incluye archivos con extensión `.island.js`.
 *
 * Idempotente. Correr tras editar `backend/src/ui/islands/*.island.js`:
 *   bun scripts/gen-islands-inline.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, 'backend/src/ui/islands')
const OUT = join(ROOT, 'backend/src/ui/islands-inline.mjs')

const files = readdirSync(SRC).filter(f => f.endsWith('.island.js'))
const entries = files.map(f => {
  const code = readFileSync(join(SRC, f), 'utf8')
  return `  ${JSON.stringify(f)}: ${JSON.stringify(code)},`
})

const banner = `// AUTO-GENERADO por scripts/gen-islands-inline.mjs — NO editar a mano.\n` +
  `// Fuente: backend/src/ui/islands/*.island.js (${files.length} archivo(s)).\n`

writeFileSync(OUT, `${banner}export const ISLANDS = {\n${entries.join('\n')}\n}\n`, 'utf8')
console.log(`✓ islands-inline.mjs generado (${files.length} islands) → ${OUT}`)

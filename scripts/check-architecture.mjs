#!/usr/bin/env node
/**
 * check-architecture.mjs — las reglas duras del portal (`bun run check`).
 *
 * _portal = **Astro (UI) + flow-engine (backend)**. Cada regla previene un bug
 * que ya nos mordió una vez (ver CHANGELOG). La regla de oro: si algo se puede
 * romper en silencio, tiene que fallar acá.
 *
 * Es la versión para el portal de `apps/sivo-pos/scripts/check-architecture.mjs`
 * (sin RBAC, sin tenant paths, sin DB: el portal es zero-secrets).
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve, relative } from 'node:path'

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(PROJECT_ROOT, p)

let total = 0

function report(ruleName, file, extra = '', message = '') {
  if (total === 0) console.log('\n✖ Architecture check falló:\n')
  console.log(`  ${rel(file)}${extra ? ` — ${extra}` : ''}`)
  if (message) console.log(`    [${ruleName}] ${message}\n`)
  total++
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) yield* walkFiles(full)
    else yield full
  }
}

function read(file) {
  try { return readFileSync(file, 'utf-8') } catch { return null }
}

const fmtPath = (p) => `/api${p}`

// ── 1. El engine no conoce a Astro ───────────────────────────────────────────
// `backend/**` es el backend (flows + runtime + nodos): tiene que poder correr
// sin Astro. El puente es `src/lib/server/*` (lo que consumen páginas y
// Actions) — nunca al revés.
{
  const name = 'backend → astro/UI (prohibido)'
  const FORBID = /from\s+['"](astro:|(\.\.\/)+src\/(pages|layouts|components|actions|styles|lib|middleware))/
  let violations = 0
  for (const file of walkFiles(join(PROJECT_ROOT, 'backend'))) {
    if (!/\.(js|mjs|ts)$/.test(file)) continue
    read(file).split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
      if (FORBID.test(line)) {
        report(name, file, `línea ${i + 1}`, 'El engine no importa de Astro ni de la UI (el puente es src/lib/server/*).')
        violations++
      }
    })
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 2. La capa vieja (Hono/htmx) no vuelve ───────────────────────────────────
// Se borró en v0.8.0: la UI es Astro y el perímetro es `src/middleware.ts`. Si
// reaparece, es un merge que trajo el pasado.
{
  const name = 'capa vieja (Hono/htmx) no vuelve'
  let violations = 0
  const ghosts = [
    'src/ui',
    'backend/app.js',
    'backend/server.js',
    'backend/worker-entry.js',
    'backend/src/ui',
    'backend/nodes/html',
    'backend/src/middleware/attach-auth-claims.js',
    'scripts/build.mjs',
    'scripts/gen-htmx-inline.mjs',
    'scripts/gen-islands-inline.mjs',
  ]
  for (const g of ghosts) {
    if (existsSync(join(PROJECT_ROOT, g))) {
      report(name, join(PROJECT_ROOT, g), '(existe)', 'Se eliminó en v0.8.0: la UI es Astro y los flows son internos.')
      violations++
    }
  }
  for (const f of walkFiles(join(PROJECT_ROOT, 'backend/flows'))) {
    if (!/\.flow\.json$/.test(f)) continue
    const base = f.split('/').pop()
    if (base.startsWith('ui.')) {
      report(name, f, '(flow ui.*)', 'Los flows `ui.*` devolvían HTML: se retiraron en v0.8.0.')
      violations++
      continue
    }
    if (read(f).includes('ui.html-response')) {
      report(name, f, '(usa ui.html-response)', 'Ese nodo se eliminó con la UI htmx.')
      violations++
    }
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 3. El directorio `flows/` es el registro ─────────────────────────────────
// Bug real: 9 imports + 9 entradas en `FLOWS` que espejaban el directorio, y
// agregar un flow sin registrarlo lo dejaba inexistente en silencio. Con
// `import.meta.glob` el filename ES la clave; esta regla impide volver atrás.
{
  const name = 'registro de flows (import.meta.glob)'
  const file = join(PROJECT_ROOT, 'backend/fe.mjs')
  const src = read(file) ?? ''
  let violations = 0
  if (!src.includes("import.meta.glob('./flows/*.flow.json'")) {
    report(name, file, '(falta glob)', "El registro tiene que ser `import.meta.glob('./flows/*.flow.json', …)`.")
    violations++
  }
  if (/from\s+['"]\.\/flows\//.test(src)) {
    report(name, file, '(import manual)', 'Importar flows a mano reintroduce el registro que espeja el directorio.')
    violations++
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 4. page-feeds ↔ `http-in` del flow ───────────────────────────────────────
// El mapa pantalla ↔ dataset declara el path público de cada read flow y el
// flow lo declara en su `http-in`. Si divergen, la pantalla pide una URL que no
// existe (404 en el render, sin error de build) o el dataset de OTRA pantalla.
{
  const name = 'page-feeds → path del flow'
  const feedsFile = join(PROJECT_ROOT, 'src/lib/page-feeds.ts')
  const flowsDir = join(PROJECT_ROOT, 'backend/flows')
  let violations = 0
  const rows = (read(feedsFile) ?? '')
    .split('\n')
    .map((line) => /flow:\s*'([^']+)'[\s\S]*?path:\s*'([^']+)'/.exec(line))
    .filter(Boolean)
    .map((m) => ({ flow: m[1], path: m[2] }))

  if (rows.length === 0) {
    report(name, feedsFile, '(sin filas)', 'No pude leer PAGE_FEEDS: ¿cambió el formato? Actualizá esta regla.')
    violations++
  }
  for (const { flow, path } of rows) {
    const file = join(flowsDir, `${flow}.flow.json`)
    if (!existsSync(file)) {
      report(name, feedsFile, `flow ${flow}`, `No existe ${flow}.flow.json (¿lo renombraste y no actualizaste el mapa?).`)
      violations++
      continue
    }
    const httpIn = JSON.parse(read(file)).find((n) => n.type === 'http-in')
    const declared = httpIn?.path ? fmtPath(httpIn.path) : null
    if (declared !== path) {
      report(name, feedsFile, `path de ${flow}`, `El mapa dice '${path}' pero el http-in es '${declared ?? '(sin http-in)'}'.`)
      violations++
    }
  }
  if (violations === 0) console.log(`✓ ${name} (${rows.length} pantallas)`)
}

// ── 5. Un solo perímetro ─────────────────────────────────────────────────────
// La identidad se resuelve UNA vez en `src/middleware.ts`. Hubo dos stack HTTP
// en paralelo (Hono para el API + el middleware para las páginas), cada uno con
// su resolución: esta regla impide que vuelva el patrón.
{
  const name = 'un solo perímetro (middleware)'
  let violations = 0
  const middlewares = ['src/middleware.ts', 'src/middleware.js']
    .filter((p) => existsSync(join(PROJECT_ROOT, p)))
  if (middlewares.length !== 1) {
    report(name, join(PROJECT_ROOT, 'src'), 'middleware', `Se esperaba exactamente 1 (src/middleware.ts), hay ${middlewares.length}.`)
    violations++
  }
  const dups = walkFiles(join(PROJECT_ROOT, 'backend')).filter((f) => /middleware/.test(f) && f.endsWith('identity.mjs') === false)
  for (const f of dups) {
    if (/attach-auth-claims|app\.js/.test(f)) continue
    report(name, f, 'perímetro duplicado', 'La identidad vive en `src/middleware.ts` (+ backend/src/middleware/identity.mjs).')
    violations++
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 6. `runFlow` siempre bajo `/api` ─────────────────────────────────────────
// Los flows se montan en `httpNodeRoot: '/api'`: un path sin el prefijo da 404
// silencioso (el body queda null y la página renderiza vacía).
{
  const name = 'runFlow → paths bajo /api'
  let violations = 0
  for (const dir of ['src/lib', 'src/actions', 'src/middleware.ts', 'src/pages']) {
    const abs = join(PROJECT_ROOT, dir)
    if (!existsSync(abs)) continue
    const files = statSync(abs).isDirectory() ? [...walkFiles(abs)] : [abs]
    for (const f of files) {
      if (!/\.(ts|astro)$/.test(f)) continue
      read(f).split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return
        const m = /runFlow\(\s*[`'"](\/[^`'"?]*)['"`]/.exec(line)
        if (m && !m[1].startsWith('/api')) {
          report(name, f, `línea ${i + 1}`, `runFlow('${m[1]}') no está bajo /api (httpNodeRoot).`)
          violations++
        }
      })
    }
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 7. CSP: la maneja Astro, sin unsafe-* y con lo que la app necesita ───────
// `unsafe-inline`/`unsafe-eval` anulan el trabajo de la migración. Y olvidarse
// de `form-action`/`frame-src` con `_auth` rompe el logout en silencio.
// `styleDirective.resources` REEMPLAZA el `'self'` por defecto: sin él, el CSS
// hasheado se bloquea (página sin estilos).
{
  const name = 'astro.config → CSP estricta y completa'
  const file = join(PROJECT_ROOT, 'astro.config.mjs')
  const src = read(file) ?? ''
  let violations = 0
  for (const [needle, msg] of [
    ["'unsafe-inline'", 'no puede estar unsafe-inline'],
    ["'unsafe-eval'", 'no puede estar unsafe-eval'],
    ['form-action', 'falta form-action (el logout postea a _auth)'],
    ['frame-src', 'falta frame-src (el iframe del logout)'],
    ["img-src 'self' data:", 'falta img-src (el favicon es un data: URI)'],
  ]) {
    const bad = needle.startsWith("'unsafe")
    if (bad ? src.includes(needle) : !src.includes(needle)) {
      report(name, file, '', msg)
      violations++
    }
  }
  if (!/styleDirective:\s*\{\s*resources:\s*\[[^\]]*'self'/.test(src)) {
    report(name, file, '', "el `styleDirective.resources` tiene que incluir 'self' (reemplaza al default y sin eso la CSP bloquea el CSS hasheado).")
    violations++
  }
  if (violations === 0) console.log(`✓ ${name}`)
}

// ── 8. `defineConfig` como objeto plano ──────────────────────────────────────
// Bug real (v0.8.0): `defineConfig(({command}) => ({...}))` ROMPE el adapter de
// Cloudflare — no inyecta sus plugins de Vite y el SSR cae a Node
// (`Cannot find module 'cloudflare:workers'`). El config tiene que ser un
// objeto; dev/build se distingue por `process.env.NODE_ENV`.
{
  const name = 'astro.config → defineConfig objeto plano'
  const file = join(PROJECT_ROOT, 'astro.config.mjs')
  // Sin comentarios: el propio archivo documenta el antipatrón en un comentario
  // y el regex lo tomaría como violación (falso positivo).
  const src = (read(file) ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const violations = []
  if (/defineConfig\s*\(\s*(async\s*)?\(/.test(src) || /defineConfig\s*\(\s*async\s+function/.test(src)) {
    report(name, file, '(función)', 'La forma función rompe el adapter de Cloudflare: usá un objeto plano.')
    violations.push(1)
  }
  if (violations.length === 0) console.log(`✓ ${name}`)
}

if (total > 0) {
  console.error(`\n${total} violación(es) encontrada(s). Corregí antes de continuar.\n`)
  process.exit(1)
}

console.log('\n✓ Architecture OK\n')

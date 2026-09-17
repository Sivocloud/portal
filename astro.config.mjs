// astro.config.mjs — _portal (panel.sivocloud.dev) con UI en Astro.
//
// Un solo Worker: Astro sirve las páginas server-rendered y los endpoints
// JSON; el backend de flows (flow-engine + RPC a `env.AUTH`) se llama
// **in-process** (`runFlow` → `fe.handleWorker`) desde las páginas/endpoints.
// NO hay Hono ni capa htmx: el perímetro (auth, 302 al login) vive en
// `src/middleware.ts`.
//
// El portal corre en la RAÍZ de su subdominio (`panel.sivocloud.dev/*` en
// prod, `https://localhost:3034/*` en dev), así que NO se usa `base`.
//
// Dev: `astro dev` corre en workerd. El Service Binding `AUTH` real no existe
// localmente (el `_auth` de dev corre en :3031 por HTTP), así que el
// middleware inyecta el fake cuando `env.AUTH` falta (ver `src/middleware.ts`).
// Se conserva el loop Paddle local: portal → _auth :3031 → _controlplane :3030.
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import { loadEnv } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

// OJO: el adapter de Cloudflare NO inyecta sus plugins de Vite si el config es
// una función (`defineConfig(({command}) => ({}))`). Por eso esto se calcula
// a nivel de módulo en vez de con el form funcional.
const IS_DEV = process.env.NODE_ENV !== 'production'
const FILE_ENV = loadEnv(IS_DEV ? 'development' : 'production', ROOT, '')
const AUTH_BASE = FILE_ENV.AUTH_BASE
  || (IS_DEV ? 'http://localhost:3031' : 'https://auth.sivocloud.dev')

/**
 * flow-engine importa el HTML del editor visual (`editor-vanilla/*.bundled`,
 * `rules.html`) esperando el CONTENIDO como string — es lo que hace
 * workerd/esbuild ("HTML/texto como módulo default"). Vite intenta parsearlos
 * como JS/JSX y rompe el build. Este plugin los carga como
 * `export default "<html>"`.
 */
function rawEditorAssets() {
  return {
    name: 'sivo-raw-editor-assets',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0]
      if (!file.endsWith('.bundled') && !(file.includes('/editor-vanilla/') && file.endsWith('.html'))) return null
      return `export default ${JSON.stringify(readFileSync(file, 'utf8'))}`
    },
  }
}

/**
 * TLS dev (mkcert): Paddle.js (checkout overlay) exige **secure context**.
 * Las rutas son relativas a `_portal/` (los certs viven en `_sivocloud/.certs`).
 * Si faltan los archivos, se sigue en HTTP (se avisa).
 */
function devTls() {
  const cert = path.resolve(ROOT, '../.certs/localhost.pem')
  const key = path.resolve(ROOT, '../.certs/localhost-key.pem')
  if (!existsSync(cert) || !existsSync(key)) {
    console.warn(`[portal] TLS dev: faltan ${cert} / ${key} → http (Paddle.js no abrirá el overlay)`)
    return undefined
  }
  return { cert: readFileSync(cert), key: readFileSync(key) }
}

export default defineConfig({
  output: 'server',
  // Sin storage de sesiones de Astro ni servicio de imágenes: la sesión es la
  // cookie de `_auth` y no hay imágenes que optimizar. Sin esto el adapter
  // provisiona un KV `SESSION` y un binding `IMAGES` al pedo.
  session: false,
  // DEV usa `wrangler.preview.jsonc` (flat): el plugin de CF para Vite no
  // resuelve las bindings de un config anidado por `env`. Deploy usa el
  // `wrangler.jsonc` de la raíz (`wrangler deploy --env prod`).
  adapter: cloudflare({
    configPath: './wrangler.preview.jsonc',
    imageService: 'passthrough',
    remoteBindings: true,
  }),
  integrations: [],
  server: { port: 3034 },
  // Prefetch de Astro: al hacer hover/focus sobre un ítem del sidebar se pide
  // la página en segundo plano y el click navega desde la caché del browser.
  // Depende de `private, max-age=30` + `Vary: Cookie` (ver `src/middleware.ts`).
  prefetch: { defaultStrategy: 'hover' },
  // CSP: la maneja Astro (hashea los <script>/<style> inline que inyecta).
  // Acá van solo las fuentes/directivas que Astro no conoce:
  //   - Google Fonts (Inter) e `img-src data:` (favicon)
  //   - Paddle.js (script del CDN) + su overlay/iframes (frame/connect)
  //   - `form-action`/`frame-src` con `_auth` = logout cross-origin al iframe
  security: {
    csp: {
      algorithm: 'SHA-256',
      // OJO: `resources` REEMPLAZA las fuentes por defecto (no las suma) →
      // hay que incluir `'self'` explícito o no cargan ni `app.css` ni la
      // isla bundleada (`/_astro/*`).
      styleDirective: { resources: ["'self'", 'https://fonts.googleapis.com'] },
      scriptDirective: { resources: ["'self'", 'https://cdn.paddle.com'] },
      directives: [
        "default-src 'self'",
        'font-src https://fonts.gstatic.com',
        "img-src 'self' data:",
        "connect-src 'self' https://*.paddle.com",
        "base-uri 'self'",
        "object-src 'none'",
        `form-action 'self' ${AUTH_BASE}`,
        `frame-src ${AUTH_BASE} https://*.paddle.com`,
      ],
    },
  },
  vite: {
    ...(IS_DEV ? { server: { https: devTls() } } : {}),
    plugins: [rawEditorAssets()],
    // El optimizer de deps (esbuild/rolldown) no pasa por los plugins de
    // Vite: si pre-bundlea @sivo/flow-engine, trata los `.bundled` del editor
    // como JSX y explota. Excluido, Vite lo procesa como source.
    optimizeDeps: { exclude: ['@sivo/flow-engine'] },
    ssr: { optimizeDeps: { exclude: ['@sivo/flow-engine'] } },
  },
})

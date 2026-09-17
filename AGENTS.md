# _portal — Portal de SIVOCLOUD (`panel.sivocloud.dev`)

> Resumen ejecutivo para IAs (o devs). Con SOLO leerlo ya saben qué es esto,
> cómo corre y qué es real vs pendiente. Si algo contradice al código, el
> código gana y este archivo está desactualizado (avisá/corregilo).

## Stack en una frase

**UI server-rendered con Astro 7** (`output: 'server'` + `@astrojs/cloudflare`)
sobre **Hono NO** / **flow-engine 2.11.0**. Las páginas y endpoints son de
Astro; cada uno pide su data llamando un **flow in-process** (`runFlow` →
`fe.handleWorker`). Los writes son POST + PRG (redirect con flash). La única
isla JS es **Paddle** (checkout overlay + Customer Portal) + el toggle de tema.

**CERO secrets de plataforma**: el worker NO tiene
`TURSO_CONTROL_PLANE_*`, `CONTROL_PLANE_ENCRYPTION_KEY`, `SESSION_SECRET` ni DB
bindings. Toda la metadata llega vía **Service Binding RPC `env.AUTH`** contra
`_auth`.

> Antes (≤ v0.7.2) la UI era **Hono + HTMX** con `ui.html-response` y templates
> en JS. Eso se eliminó en v0.8.0 (ver `CHANGELOG`). El backend de flows/nodes
> sobrevivió; sólo cambió quién lo llama.

## Estructura

```
_portal/
├── AGENTS.md                          ← este archivo
├── README.md
├── package.json                       ← bun + scripts (raíz)
├── astro.config.mjs                   ← Astro: adapter CF, CSP, TLS dev
├── tsconfig.json / src/env.d.ts
├── wrangler.jsonc                     ← DEPLOY (main: adapter; env dev/prod)
├── wrangler.preview.jsonc             ← DEV (flat: el plugin de CF no resuelve `env` anidado)
│
├── public/theme.js                    ← init del tema, parser-blocking (sin flash)
├── src/                               ← LA UI (Astro)
│   ├── middleware.ts                  ← perímetro: SIVO_ENV + auth + 302/401 + fake dev
│   │                                     + PRG de Actions (cookie de 1 uso) + caché de página
│   ├── actions/index.ts               ← los writes (Astro Actions: Zod + PRG)
│   ├── layouts/Shell.astro            ← sidebar + topbar + toast
│   ├── lib/
│   │   ├── page-feeds.ts              ← TABLA DE RUTAS: pantalla ↔ flow ↔ nav (fuente única)
│   │   ├── nav.ts                     ← NAV / NAV_SOON (derivados de page-feeds)
│   │   ├── format.ts                  ← escape/fechas/moneda/badge/iconos
│   │   ├── flash.ts                   ← resultado de Action → toast del shell
│   │   └── server/
│   │       ├── flows.ts               ← `runFlow` (in-process) + `feEnv`
│   │       └── page-data.ts           ← `loadPage(Astro)`: dataset de la pantalla actual
│   ├── components/                    ← Badge.astro, AppCard.astro
│   ├── islands/paddle.ts              ← ÚNICA isla cliente (Paddle)
│   ├── styles/app.css
│   └── pages/
│       ├── index.astro                → Inicio   (flow portal.overview)
│       ├── aplicaciones.astro         → Apps     (flow portal.apps)
│       ├── facturacion.astro          → Billing  (flow portal.billing)
│       └── api/health.ts, api/facturacion/{checkout,portal}.ts  → JSON
│
├── backend/                           ← FLOW-ENGINE RUNTIME ONLY
│   ├── fe.mjs                         ← única instancia de flow-engine
│   │                                     (los flows se registran con import.meta.glob:
│   │                                      el filename ES la clave)
│   ├── flows/
│   │   ├── error-handler-500.flow.json
│   │   ├── portal.overview.flow.json          ← GET  /portal/overview
│   │   ├── portal.apps.flow.json              ← GET  /portal/apps
│   │   ├── portal.billing.flow.json           ← GET  /portal/billing
│   │   ├── portal.app.toggle.flow.json        ← POST /portal/apps/toggle
│   │   ├── portal.support.set.flow.json       ← POST /portal/billing/support
│   │   ├── portal.autorenew.set.flow.json     ← POST /portal/billing/autorenew
│   │   ├── portal.billing-checkout.flow.json  ← POST /portal/billing/checkout
│   │   └── portal.billing-portal.flow.json    ← POST /portal/billing/portal
│   ├── nodes/
│   │   ├── index.js                   ← registry (extraNodes)
│   │   └── portal/                    ← los 8 nodos RPC (reads/writes/Paddle)
│   └── src/
│       ├── lib/env.mjs                ← env proxy (globalThis.SIVO_ENV)
│       ├── middleware/identity.mjs    ← resolución de identidad (sin Hono)
│       └── dev/fake-auth-binding.mjs  ← dev-only: mock de `env.AUTH` (HTTP a :3031)
└── scripts/
    ├── dev-backend.mjs                ← dev: _auth (:3031) + astro dev (:3034)
    ├── check-architecture.mjs         ← reglas duras del repo (8 reglas)
    └── smoke.mjs                      ← smoke Chrome headless (CSP/SSR/isla/Actions)
```

## Cómo corre

```bash
bun install
cp .env.example .env.development
bun run dev:dev    # [auth] :3031 (reusa si ya está) + astro dev :3034
# UI: https://localhost:3034/
```

- **Dev**: `astro dev` corre en **workerd** (via `@astrojs/cloudflare`). El
  Service Binding `AUTH` no existe localmente → el middleware monta el **fake
  binding** (HTTP contra `_auth` :3031) en `globalThis.__SIVO_DEV_AUTH__`.
  Se conserva el loop Paddle local: `portal → _auth :3031 → _controlplane :3030`.
- **HTTPS dev (obligatorio para Paddle)**: el overlay exige secure context. Los
  certs de mkcert viven en `_sivocloud/.certs/` y `astro.config.mjs` los usa en
  `vite.server.https`. Sin certs arranca en HTTP (y el overlay no abre).
- **Prod**: `wrangler deploy --env prod` → `panel.sivocloud.dev/` (subdominio
  propio; el path de dev y prod es el mismo, sin prefijo).

## Arquitectura (reglas)

1. **El backend = flows + RPC.** Cada operación es un flow JSON que termina en
   `http-response` (JSON). El negocio es **metadata vía RPC** (`getTenantInfo`,
   `getInstalledApps`, `getSubscription`, `createCheckout`, …) — NO hay DB.
2. **NO hay Hono.** El perímetro (publicar `SIVO_ENV`, resolver identidad,
   302 al login / 401 JSON) vive en `src/middleware.ts`, compartiendo
   `backend/src/middleware/identity.mjs`.
3. **Los flows son INTERNOS.** No se exponen por HTTP: `runFlow('/api/<flow>')`
   los llama in-process usando su `http-in` como dirección (el motor los monta
   bajo `/api`). El browser solo habla con páginas y endpoints de Astro.
4. **Todo llega del server.** La página corre su read flow **durante el
   render**; no hay fetch del cliente para contenido. Los writes son POST al
   server que redirigen (PRG) y la página re-consulta el estado real.
5. **Islas**: sólo `paddle.ts` (SDK de Paddle en el browser) y el toggle de
   tema. Sin framework: TS vanilla, bundleado por Astro.
6. **CSS vanilla** en `src/styles/app.css` (clases `.btn`, `.card`, `.badge`,
   `.kpi`, …). Sin Tailwind ni utilidades.
7. **Una sola tabla de rutas** (`src/lib/page-feeds.ts`): path del flow, nav y
   paths públicos salen de ahí. La página no repite el path — `loadPage(Astro)`
   lo deriva de la URL.
8. **Los writes son Astro Actions** (`src/actions/index.ts`): Zod + `runFlow` +
   PRG. La Action no reimplementa negocio, sólo llama el flow.

## Agregar una sección

1. **Flow read** `backend/flows/portal.<sección>.flow.json`:
   ```json
   [
     { "id": "in", "type": "http-in", "method": "GET", "path": "/portal/<sección>", "wires": [["n"]] },
     { "id": "n", "type": "<nodo que arma la data>", "wires": [["shape"]] },
     { "id": "shape", "type": "transform", "expression": "payload.data", "outputProperty": "payload", "wires": [["resp"]] },
     { "id": "resp", "type": "http-response", "statusCode": "200", "wires": [[]] },
     { "id": "catch", "type": "catch", "scope": "", "wires": [["err500Handler"]] },
     { "id": "err500Handler", "type": "subflow", "flowRef": "error-handler-500", "outputPath": "payload", "wires": [["err500"]] },
     { "id": "err500", "type": "http-response", "statusCode": "500", "wires": [[]] }
   ]
   ```
   Los nodos de lectura devuelven `{ data: {...} }` → el `transform` lo
   desenvuelve para que el body sea la data pelada.
   **No hay que registrarlo**: `fe.mjs` usa `import.meta.glob`, el filename ES
   la clave del flow.
2. **Fila en `src/lib/page-feeds.ts`** (fuente única): `pages`, `flow`, `path`
   (el path público del flow, `/api/...`) y `nav`. El check de arquitectura
   verifica que `path` coincida con el `http-in` del flow y que `flow` exista.
3. **Página** `src/pages/<sección>.astro`:
   ```astro
   const { data } = await loadPage(Astro)
   ```
   y renderizá con el `Shell.astro` (le pasás `title`, `active`, `user`,
   `tenantId`). El nav sale solo (derivado de `page-feeds`).
4. **Writes**: una Action en `src/actions/index.ts` (`defineAction` con Zod) que
   llama el flow con `runFlow` y devuelve `{ toast }`; el middleware hace el PRG
   con una cookie de un solo uso. En la página, un `<form action={actions.x}>` +
   `flashFromResults(Astro, [actions.x])` para el toast.

## Gotchas que ya nos mordieron

- **`defineConfig` con función ROMPE el adapter de Cloudflare.** Si el config es
  `defineConfig(({command}) => ({...}))`, el adapter NO inyecta sus plugins de
  Vite y el SSR corre en Node → `Cannot find module 'cloudflare:workers'`.
  Calculá todo a nivel de módulo (`process.env.NODE_ENV` distingue dev/build).
  Lo verifica el check de arquitectura (regla 8).
- **`security.csp.scriptDirective.resources` / `styleDirective.resources`
  REEMPLAZAN el `'self'` por defecto** (no lo suman). Si no incluís `'self'`,
  la app queda sin CSS y sin isla. El smoke test lo detecta.
- **Los flows se montan bajo `/api`** (`httpNodeRoot`). `runFlow` recibe el
  path completo: `/api/portal/overview`, no `/portal/overview`.
- **`context.originPathname` trae trailing slash** (`/facturacion/`): hay que
  sacarlo al redirigir y al matchear la ruta (`feedFor` normaliza) o la página
  renderiza vacía (el path no matchea la tabla).
- **Astro Actions form**: el `<form>` renderiza `action="?_action=<nombre>"`.
  El middleware intercepta con `getActionContext()`, guarda el resultado en una
  cookie y redirige; la página lo lee con `Astro.getActionResult()`.
- **Astro ignora archivos/dirs con prefijo `_`** en `src/pages/`.
- **Nada de `style="…"` inline ni `onclick=`**: la CSP es estricta. Para barras
  usá `<progress>` o clases; los writes van por `<form>` + Action.
- **Dev no emite CSP** (Astro sólo la manda en el build). Para validar CSP
  corré `astro build` + `astro preview` + `bun run smoke`. El modo "fake auth"
  en un build local se activa con `DEV_AUTH_FAKE=1` (en `wrangler.preview.jsonc`).
- **`astro dev` se auto-manda a background** cuando lo lanza un agente; seteá
  `ASTRO_DEV_BACKGROUND=1` para forzar foreground (el nombre engaña).
- **El config de dev es FLAT** (`wrangler.preview.jsonc`): el plugin de CF no
  resuelve `services`/`vars` de un `wrangler.jsonc` anidado por `env`.
- **`astro preview` puede quedar zombie** (el `pkill` mata el launcher, no el
  server). Si el smoke falla con 500 en `/_astro/*` y CSS sin aplicar, matá el
  proceso del puerto y levantá uno solo.

## Check de arquitectura

`bun run check` corre `lint-flows` + `audit-nodes` + `check:arch` +
`astro check`. Las 8 reglas de `scripts/check-architecture.mjs` son las mismas
que `apps/sivo-pos` (adaptadas: sin RBAC, sin DB): engine sin Astro, capa vieja
que no vuelve, registro por glob, `page-feeds` ↔ `http-in`, un solo perímetro,
`runFlow` bajo `/api`, CSP estricta y `defineConfig` objeto plano.

## Nodos/RPC

Todos en `backend/nodes/portal/`, todos RPC vía `env.AUTH`:
`portal-overview`, `portal-apps-catalog`, `portal-billing` (reads);
`portal-app-toggle`, `portal-set-support`, `portal-set-autorenew` (writes);
`portal-paddle-checkout`, `portal-paddle-portal` (Paddle).

El cookie de sesión llega al flow vía `ctx.env.cookieHeader` (lo setea `feEnv`
en `src/lib/server/flows.ts`).

## Links env-aware

Login/logout y "Abrir app" usan bases configurables:
- `AUTH_BASE` (default `https://auth.sivocloud.dev`)
- `APPS_BASE` (default `https://apps.sivocloud.dev`)
- `APP_BASES` (override per-app, dev)

En dev apuntan a los puertos locales.

## Deploy

```bash
bun run check        # lint-flows + audit-nodes + check:arch + astro check
bun run smoke        # contra un build (astro preview)
wrangler deploy --env prod
```

Service Binding `AUTH` declarado en `wrangler.jsonc`
(`env.dev.services` / `env.prod.services`) → target `sivocloud-auth-dev` /
`sivocloud-auth`. **Deployar `_auth` antes que `_portal`.**

## Pendiente / futuro

- Sección **Configuración** (hoy placeholder en `NAV_SOON`).
- RBAC en el portal: hoy zero-secrets RPC; si Config necesita escribir, definir
  nuevos RPC en `_auth` (no darle D1 al portal).
- **Facturación**: read + writes acotados (soporte, auto-renovación) + Paddle
  (checkout/portal). El cobro recurrente y el overage los maneja `_controlplane`.
- **Fuentes self-hosted** (Astro Fonts API, como sivo-pos): hoy Inter viene de
  Google Fonts; self-hosteada baja el FCP y saca `fonts.googleapis.com` /
  `fonts.gstatic.com` de la CSP.
- **Editor de flows** (`/_editor`, read-only con Basic Auth): sivo-pos lo sirve
  desde el mismo worker; el portal todavía no.

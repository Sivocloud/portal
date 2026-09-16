# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [v0.5.1] — 2026-09-16 — `portal.sivocloud.dev` → `panel.sivocloud.dev`

### Changed

- **URL canónica renombrada a `panel.sivocloud.dev/`** (route del Worker +
  `APP_DOMAIN` de prod). Motivo: `portal.sivocloud.dev` colisionaba con el
  wildcard `*.sivocloud.dev/*` que reclama `_sivostudio` (launcher de SivoStudio
  + preview URLs del sandbox de `@cloudflare/sandbox`). Como `_portal` nunca se
  había deployado, ese subdominio caía al wildcard y servía la SPA de SivoStudio
  en lugar del portal.
- El rename fue **gratis**: sin deploy previo no había bookmarks, usuarios,
  cookies en ese origin ni links externos. `_auth` actualizó su
  `DEFAULT_PORTAL_URL` en el mismo pase.
- Docs (`AGENTS.md`, `README.md`, `package.json`) actualizadas. Las entradas
  históricas de este CHANGELOG conservan la URL vieja (son registro).

## [v0.5.0] — 2026-09-15 — Aplicaciones: catálogo y desinstalar/reinstalar

Nueva sección **Aplicaciones**: el dueño ve sus apps, el catálogo con precios
y puede desinstalar/reinstalar dentro de la ventana de retención. Todo vía RPC
`env.AUTH` (el portal sigue zero-secrets).

### Added

- **Vista `apps.js`**: "Tus apps" (estado, precio, cuenta regresiva de purga y
  acciones) + "Catálogo" (apps con precio/franquicia y estado).
- **Nodos `portal-apps-catalog`** (agrega `listCatalog` + `getInstalledApps`) y
  **`portal-app-toggle`** (`uninstallApp` / `reactivateApp`).
- **Flows `ui.apps`** (`GET /_ui/aplicaciones`) y **`ui.apps-toggle`**
  (`POST /_ui/aplicaciones/toggle`, swap `outerHTML` de `#apps-body` + toast OOB).
- Mocks de los 3 RPC en `fake-auth-binding.mjs` (endpoint dev
  `/api/auth/broker/apps`).

### Changed

- **Nav**: el dashboard pasa a "Inicio"; se agrega "Aplicaciones"
  (`/aplicaciones`) con icono propio.
- **CSS**: `.btn.danger`, `.notice.warn` para el aviso de purga.

### Notes

- **Instalar** una app nueva no está disponible: implica provisionar la DB del
  tenant (hoy manual/out-of-band). El catálogo es informativo.

## [v0.4.0] — 2026-09-15 — Facturación: suscripción, consumo y facturas

Activa la sección **Facturación** (antes placeholder en el nav): el dueño de
la cuenta ve su suscripción (fee por app + metered con franquicia), el consumo
del período y las facturas, y puede cambiar el plan de soporte y la
auto-renovación. Sigue zero-secrets: todo llega vía RPC `env.AUTH`.

### Added
- Vista `billing` (`src/ui/templates/billing.js`) con KPIs (próximo cobro
  estimado, consumo del período), tabla de conceptos, selector de plan de
  soporte (Estándar/Premium/Sin soporte), toggle de auto-renovación, consumo
  con barra de franquicia y listado de facturas.
- Nodos RPC `portal-billing` (agrega `getSubscription` + `getUsageSummary` +
  `getInvoices`), `portal-set-support` y `portal-set-autorenew`.
- Flows `ui.billing`, `ui.billing-support`, `ui.billing-autorenew`
  (`GET /facturacion`, `POST /facturacion/soporte`, `POST /facturacion/autorenew`).
  Los writes swapean `#billing-body` (HTMX) con toast OOB.
- Helpers `fmtMoney` / `fmtPeriod` y CSS de billing (`.kpi-grid`, `.tbl`,
  `.progress`, `.pill-group`).
- `fake-auth-binding.mjs`: mock local de los 5 RPCs de billing.

### Changed
- **NAV**: "Facturación" pasa de `NAV_SOON` a `NAV` (`/facturacion`);
  "Configuración" sigue como próxima.

Tests: el portal no tiene suite propia; se validó el arranque de `fe.mjs` (7
rutas) y los RPCs de billing en `_auth` (`bun test` 44/44).

## [v0.3.0] — 2026-09-15 — Server-rendered (HTMX) + subdominio `portal.sivocloud.dev`

El portal migra de **SPA Svelte + Vite** a **server-rendered con HTMX**
(mismo patrón que `apps/sivo-pos-htmx`). Toda la UI vive en `backend/src/ui/`;
se elimina `frontend/` y el binding CF `assets`. La metadata sigue llegando
por Service Binding RPC (`env.AUTH`) — zero-secrets intacto.

Además pasa de `apps.sivocloud.dev/portal/*` a su **propio subdominio
`portal.sivocloud.dev/`** (igual que `auth.sivocloud.dev`): es un servicio de
plataforma, no una app por-tenant. El dashboard vive en `/` y las secciones en
`/<section>` — se va el redundante `/portal/ui/portal`.

### Added
- Capa UI server-rendered: `backend/src/ui/{pages,templates,fragments,styles,static}.js`,
  vendor de HTMX (inlinado) e **infra de islands** (`islands/*.island.js` +
  `islands-inline.mjs`), pensada para futuras secciones (Facturación,
  Configuración — hoy placeholders en el nav).
- Nodo `ui.html-response` (render server-side) + nodo `portal-overview`
  (agrega `getTenantInfo` + `getInstalledApps` en un solo payload).
- Flow `ui.portal.flow.json` → `GET /_ui/portal` (dashboard).
- Scripts `dev-backend.mjs`, `gen-htmx-inline.mjs`, `gen-islands-inline.mjs`.
- Vars `AUTH_BASE` / `APPS_BASE` (links logout / abrir-app env-aware) y
  `APP_BASES` (override per-app en dev, JSON `{ "<slug>": "<base>" }`) para
  que "Abrir" apunte al puerto correcto de cada app local (pos :3032,
  b2b :3033, …).

### Changed
- **URL**: `apps.sivocloud.dev/portal/*` → `portal.sivocloud.dev/*` (route en
  `wrangler.jsonc`; dev replica la raíz en `localhost:3034/`). Dashboard en
  `/`; assets en `/static/*` (antes `/ui/static/*`); páginas en `/<section>`.
- `app.js`: Hono sirve `/health`, `/static/*`, `/api/*` y las páginas
  (`/` + catch-all → flow `ui.*`); se elimina el rewrite `/ui/*` y el prefijo
  `x-app-prefix`. `worker-entry.js` ya no usa `env.ASSETS`.
- `@sivo/flow-engine` `2.8.1` → `2.11.0`. Se quita `@hono/node-server`.
- `package.json`: scripts nuevos (sin Vite); `dev:dev` usa `dev-backend.mjs`.

### Removed
- `frontend/` (Svelte 5 + Vite 7 + Tailwind/DaisyUI) y el binding `assets`.
- `lib/portal-path.mjs` y el header `x-app-prefix` (ya no hay prefijo de app).
- Rutas `apps.sivocloud.dev/portal*` (sin redirect; el `dispatcher` las deja
  en 404).

### Fixed
- Links y redirect de login/logout estaban hardcodeados a prod; ahora son
  env-aware (`AUTH_BASE`/`APPS_BASE`).

## [v0.2.4] — 2026-09-15 — fix: `/portal` sin barra final caía al dispatcher

`apps.sivocloud.dev/portal` (sin la barra) no matcheaba la route
`/portal/*`, así que caía al catch-all del `tenants-dispatcher`
(`apps.sivocloud.dev/*`) → "ruta inválida" (un path de 1 solo segmento
no lo puede parsear). El worker ya soportaba `/portal` vía
`stripAppPrefix`; solo faltaba la route.

### Fixed
- `wrangler.jsonc`: ruta exacta `apps.sivocloud.dev/portal` además de
  `/portal/*` (mismo patrón que se usó en sivo-connect).

## [v0.2.3] — 2026-09-15 — fix: link de la app connect en el portal

La tarjeta de `connect` aparecía en el portal (porque `tenant_apps` la marca
`active`) pero su botón no navegaba: `launchUrl()` cae a `'#'` para los slugs
que no están en el mapa hardcodeado. sivo-connect ya se sirve con tenant en el
path (`/connect/<tenant>`), consistente con `/sivopos/<tenant>` y
`/b2b/<tenant>`.

### Fixed
- `frontend/src/App.svelte`: `connect: (sub) => \`https://apps.sivocloud.dev/connect/${sub}\``
  en el mapa `appSlug → URL` de `launchUrl()`.

## [v0.2.2] — 2026-09-14 — fix: bundle SPA resuelve el runtime client de svelte

Tras v0.2.1 el SPA cargaba pero crasheaba en el browser:
`Uncaught Svelte error: lifecycle_function_unavailable — mount(...) is not
available on the server`. El bundle resolvía `svelte` (entry `.`) al **server
entry** (`svelte/src/index-server.js`), donde `mount` es un stub que siempre
tira ese error. Vite 7 no activa `browser` por defecto en este build y las
exports de svelte 5.57 (`worker`/`browser`/`default`) caían en `default`.

### Fixed
- `frontend/vite.config.js`: `resolve.conditions` con `browser` explícito →
  `import { mount }` de `main.js` resuelve a `svelte/src/index-client.js`.

### Tests
- Bundle verificado: desapareció el stub `mount`/mensaje "not available on
  the server"; el hash cambió (`index-2STselcd.js`). Build worker + frontend
  verdes, deploy (Version `3a2bd52f`), assets 200.

## [v0.2.1] — 2026-09-14 — fix: SPA con base `/portal/` (blank screen en prod)

El portal servía el `index.html` (200) pero la pantalla quedaba en blanco:
el SPA usaba URLs absolutas de raíz (`/assets/...`, `/api/portal/me`) que
**no pasan por la ruta del worker** `apps.sivocloud.dev/portal/*`. Esos
requests caían en `tenants-dispatcher` (dueño de `apps.sivocloud.dev/*`),
que intentaba despachar a workers inexistentes y devolvía 500 `error code:
1101` — el JS nunca cargaba y el dashboard quedaba vacío.

### Fixed
- `frontend/vite.config.js`: `base: '/portal/'` — el `index.html` buildeado
  ahora referencia `/portal/assets/...`, que sí matchea la ruta del worker.
- `frontend/src/App.svelte`: los `fetch` de boot apuntan a
  `/portal/api/portal/me` y `/portal/api/portal/apps` (el worker le saca el
  prefijo y el Hono recibe `/api/portal/*` como siempre).
- `frontend/vite.config.js`: el proxy de dev reescribe `/portal/api` → `/api`
  para que el backend local (:3034) matchee sus rutas sin el prefijo.

### Changed
- El dashboard ahora carga: navbar + hero del tenant + lista de apps
  instaladas. APIs verificadas en prod: `/portal/api/portal/me` y
  `/portal/api/portal/apps` → 401 `{"error":"No session"}` sin cookie.

### Tests
- `bun run build:worker` y `bun run build` (frontend) verdes.
- Verificado en prod (Version `e2f2237f`): HTML con `/portal/assets/*`,
  JS/CSS 200, APIs 401 sin sesión.

## [v0.2.0] — 2026-09-14 — Auth gate: HTML sin cookie redirige al login

### Added
- `backend/worker-entry.js`: requests HTML sin cookie de sesión → 302 a
  `auth.sivocloud.dev/login?return_to=<current>` antes de delegar.
  Requests API pasan y obtienen 401 JSON (server-to-server).

## [v0.1.0] — 2026-09-13 — sivocloud-portal: proof de zero-secrets

### Added
- Worker `sivocloud-portal` bajo `apps.sivocloud.dev/portal/*`.
- Dashboard SPA (Svelte 5 + Vite + DaisyUI): me + apps del tenant.
- Custom nodes `portal-me` y `portal-apps` vía RPC `env.AUTH`.
- Patrón zero-secrets: sin tokens de plataforma, sin SESSION_SECRET.
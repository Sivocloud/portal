# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
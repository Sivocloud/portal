# _portal — Portal de SIVOCLOUD (`portal.sivocloud.dev`)

> Resumen ejecutivo para IAs (o devs). Con SOLO leerlo ya saben qué es esto,
> cómo corre y qué es real vs pendiente. Si algo contradice al código, el
> código gana y este archivo está desactualizado (avisá/corregilo).

## Stack en una frase

**Server-rendered con HTMX** sobre **Hono + flow-engine 2.11.0**, con
**islands JS** hidratadas. **SIN `/frontend`**: toda la UI vive en
`backend/src/ui/`. Patrón idéntico a `apps/sivo-pos-htmx`.

**CERO secrets de plataforma**: el worker NO tiene `TURSO_CONTROL_PLANE_*`,
`CONTROL_PLANE_ENCRYPTION_KEY`, `SESSION_SECRET` ni DB bindings. Toda la
metadata llega vía **Service Binding RPC `env.AUTH`** contra `_auth`.

## Estructura

```
_portal/
├── AGENTS.md                          ← este archivo
├── README.md
├── package.json                       ← bun + scripts (raíz)
├── wrangler.jsonc                     ← deploy CF (main: backend/worker-entry.js)
│
├── backend/                           ← FLOW-ENGINE RUNTIME ONLY
│   ├── app.js                         ← Hono: CORS + auth + /ui/* → /api/_ui/* + forward
│   ├── server.js                      ← dev: Bun.serve (:3034), normaliza /portal
│   ├── worker-entry.js                ← prod: bridge CF (normaliza /portal)
│   ├── fe.mjs                         ← única instancia de flow-engine
│   ├── flows/
│   │   ├── error-handler-500.flow.json
│   │   ├── health.flow.json
│   │   ├── portal-me.flow.json        ← API JSON (RPC getTenantInfo)
│   │   ├── portal-apps.flow.json      ← API JSON (RPC getInstalledApps)
│   │   └── ui.portal.flow.json        ← página HTML (flow ui.*)
│   ├── nodes/
│   │   ├── index.js                   ← registry (extraNodes)
│   │   ├── auth/                      ← portal-me, portal-apps (RPC)
│   │   ├── portal/portal-overview.js  ← agregado del dashboard (RPC x2)
│   │   └── html/html-response.js      ← `ui.html-response` (render server-side)
│   └── src/
│       ├── lib/env.mjs                ← env proxy (whitelist + getAuthBase/getAppsBase)
│       ├── middleware/attach-auth-claims.js  ← auth via RPC (browser→302 login)
│       ├── dev/fake-auth-binding.mjs  ← dev-only: mock de `env.AUTH` (HTTP a :3031)
│       └── ui/                        ← capa de UI server-rendered
│           ├── pages.js               ← shell (sidebar + topbar + islands bootstrapper)
│           ├── fragments.js           ← escape, iconos, badges, fechas
│           ├── styles.js              ← CSS vanilla (string)
│           ├── static.js              ← sirve CSS/htmx/islands
│           ├── templates/             ← index.js (registry) + portal.js + misc.js
│           ├── islands/               ← *.island.js (theme, shared)
│           ├── islands-inline.mjs     ← AUTO-GENERADO (gen:islands)
│           └── vendor/                ← htmx.min.js + htmx-inline.mjs (gen:htmx)
└── scripts/
    ├── dev-backend.mjs                ← dev: _auth (:3031) + portal (:3034)
    ├── gen-htmx-inline.mjs            ← htmx.min.js → htmx-inline.mjs
    ├── gen-islands-inline.mjs         ← islands/*.island.js → islands-inline.mjs
    ├── build.mjs                      ← esbuild bundle (chequeo de tamaño)
    └── patch-deployed-wrangler.mjs
```

## Cómo corre

```bash
bun install
cp .env.example .env.development

bun run dev:dev    # [auth] :3031 (reusa si ya está) + [be] :3034
# UI: http://localhost:3034/
```

- **Dev**: `bun server.js` (Bun) sirve TODO en la raíz (`localhost:3034/`). El
  binding `env.AUTH` lo suple `fake-auth-binding.mjs` (HTTP a `_auth` :3031) →
  paridad local↔prod.
- **Prod**: `wrangler deploy --env prod` → `portal.sivocloud.dev/` (subdominio
  propio, igual que `auth.sivocloud.dev`; el path de dev y prod es el mismo).

## Arquitectura (reglas)

1. **El backend = flows + RPC.** Cada endpoint es un flow JSON. El negocio
   del portal es **metadata vía RPC** (`getTenantInfo`, `getInstalledApps`,
   `verifySession`) — NO hay DB propia.
2. **Hono hace SOLO el perímetro**: CORS, auth (`attachAuthClaims`) y
   forward a flow-engine (las páginas `/ui/*` se reescriben a `/api/_ui/*`).
3. **UI server-rendered**: las páginas son flows `ui.*` que terminan en el
   nodo `ui.html-response` (renderiza una vista de `src/ui/templates`).
4. **Islands**: JS cliente en `src/ui/islands/*.island.js`, inlinados por
   `gen:islands` y servidos en `/ui/static/islands/*`. Hoy: `theme`.
5. **NO `/frontend`**: no hay Svelte ni Vite. CSS vanilla en `styles.js`.

## Agregar una página/section (ej. Facturación)

1. **Vista** en `backend/src/ui/templates/<section>.js`
   (`(ctx) => { title, active, html }`) y registrala en `templates/index.js`.
2. **Flow** `backend/flows/ui.<section>.flow.json`:
   ```json
   [
     { "id": "in", "type": "http-in", "method": "GET", "path": "/_ui/<section>", "wires": [["ov"]] },
     { "id": "ov", "type": "<nodo que arma la data>", "wires": [["r"]] },
     { "id": "r", "type": "ui.html-response", "wires": [[]], "view": "<section>", "layout": "app", "dataPath": "payload.data" }
   ]
   ```
3. **Registrar** el flow en `backend/fe.mjs` (FLOWS map).
4. **Nav**: sumar la entrada en `NAV` (o pasar de `NAV_SOON` a `NAV`) en
   `backend/src/ui/pages.js`.

## Agregar una isla JS

1. `backend/src/ui/islands/<nombre>.island.js` exportando `hydrate(root)`.
2. `bun run gen:islands` (regenera `islands-inline.mjs`).
3. Registrar el root en `ISLAND_ROOTS` del bootstrapper (`pages.js`) y
   marcar el elemento con `data-island="<nombre>"`.

## Nodos/RPC

- `portal-me` / `portal-apps`: API JSON legacy (RPC individual).
- `portal-overview`: agregado del dashboard (llama los 2 RPC y combina).
- `ui.html-response`: terminal; renderiza la vista + shell.

El cookie de sesión llega al flow vía `ctx.env.cookieHeader` (lo setea
`app.js` al forwardear).

## Links env-aware

Login/logout y "Abrir app" usan bases configurables:
- `AUTH_BASE` (default `https://auth.sivocloud.dev`)
- `APPS_BASE` (default `https://apps.sivocloud.dev`)

En dev apuntan a los puertos locales (ver `.env.example`).

## Deploy

```bash
bun run gen:htmx && bun run gen:islands   # si tocaste vendor/ o islands/
wrangler deploy --env prod                # bundlea backend/worker-entry.js
```

Service Binding `AUTH` debe estar declarado en `wrangler.jsonc`
(`env.dev.services` / `env.prod.services`) → target `sivocloud-auth-dev` /
`sivocloud-auth`. **Deployar `_auth` antes que `_portal`.**

## Pendiente / futuro

- Secciones **Facturación** y **Configuración** (hoy placeholders en `NAV_SOON`).
- RBAC en el portal: hoy zero-secrets RPC; si Config necesita escribir, hay
  que definir nuevos RPC en `_auth` (no darle D1 al portal).

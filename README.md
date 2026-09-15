# SIVOCLOUD Portal

Portal de SIVOCLOUD — `portal.sivocloud.dev/`. **Server-rendered con
HTMX** (sin SPA). Ver [AGENTS.md](./AGENTS.md) para la guía arquitectónica.

**La prueba viva del patrón zero-secrets**: este worker **NO** tiene
`TURSO_CONTROL_PLANE_*`, `CONTROL_PLANE_ENCRYPTION_KEY`, `SESSION_SECRET`
ni DB bindings de plataforma. Solo `env.AUTH` (Service Binding RPC) contra
`_auth`.

Toda la metadata de tenant/apps viene vía RPC:
- `env.AUTH.getTenantInfo({cookie})` → tenant metadata
- `env.AUTH.getInstalledApps({cookie})` → lista apps instaladas
- `env.AUTH.verifySession(cookie)` → auth claims (middleware Hono)

## Stack

- **Backend**: Hono 4 + `@sivo/flow-engine` 2.11.0 (CF Worker)
- **UI**: HTML server-rendered + HTMX + CSS vanilla + islands JS
- **Auth**: cookie `__Secure-sivocloud_session` (cross-subdomain)
- **Deploy**: UN SOLO Cloudflare Worker. URL: `portal.sivocloud.dev/`

## Quick start

```bash
bun install
cp .env.example .env.development

bun run dev:dev    # [auth] :3031 (reusa si ya está) + [be] :3034
# UI: http://localhost:3034/
```

> Necesitás `_auth` en `:3031` (el portal NO emite cookies, solo las consume
> vía RPC). `bun run dev:dev` lo levanta si no está.

## Estructura (backend-only)

```
backend/
├── app.js            ← Hono (CORS + auth + páginas → /api/_ui/* + forward)
├── server.js         ← dev: Bun.serve :3034 (raíz)
├── worker-entry.js   ← prod: CF Worker
├── fe.mjs            ← flow-engine (flows: portal-me, portal-apps, ui.portal)
├── flows/            ← *.flow.json
├── nodes/            ← portal-overview, portal-me/apps, html-response
└── src/
    ├── lib/          ← env.mjs
    ├── middleware/   ← attach-auth-claims.js
    └── ui/           ← pages, templates, islands, styles, static
```

## Agregar una sección

1. Vista en `backend/src/ui/templates/<section>.js` + registro en `index.js`.
2. Flow `ui.<section>.flow.json` (ver AGENTS.md).
3. Registrar el flow en `fe.mjs` + link en `NAV` (`pages.js`).

## Deploy

```bash
bun run gen:htmx && bun run gen:islands   # si tocaste vendor/ o islands/
wrangler deploy --env prod
```

## Zero secrets

`wrangler secret list --env prod` retorna `[]` (vacío). El portal solo tiene
`env.AUTH` (Service Binding).

Si este worker fuera comprometido, el atacante NO podría listar todos los
tenants/owners, leer credenciales de otros tenants, modificar planes, ni
mintear sesiones. Solo vería la metadata del tenant actual (un cookie).

## Pendiente

- Secciones **Facturación** y **Configuración** (hoy placeholders en el nav).

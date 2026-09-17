# SIVOCLOUD Portal

Portal de SIVOCLOUD — `panel.sivocloud.dev/`. UI **server-rendered con
Astro** (sin SPA, sin Hono): las páginas y endpoints piden su data a un flow
de **flow-engine** llamado in-process. Ver [AGENTS.md](./AGENTS.md) para la
guía arquitectónica.

**La prueba viva del patrón zero-secrets**: este worker **NO** tiene
`TURSO_CONTROL_PLANE_*`, `CONTROL_PLANE_ENCRYPTION_KEY`, `SESSION_SECRET` ni DB
bindings de plataforma. Solo `env.AUTH` (Service Binding RPC) contra `_auth`.

Toda la metadata de tenant/apps/facturación viene vía RPC:
- `env.AUTH.verifySession(cookie)` → auth claims (perímetro de Astro)
- `env.AUTH.getTenantInfo({cookie})` / `getInstalledApps({cookie})`
- `env.AUTH.getSubscription({cookie})` / `getUsageSummary` / `getInvoices`
- `env.AUTH.createCheckout` / `createWalletTopup` / `createPortalSession`

## Stack

- **UI**: Astro 7 (`output: 'server'`) + `@astrojs/cloudflare` — páginas
  server-rendered, islas vanilla (solo Paddle + tema), CSS vanilla.
- **Backend**: `@sivo/flow-engine` 2.11.0 (flows internos, llamados in-process).
- **Auth**: cookie `__Secure-sivocloud_session` (cross-subdomain) verificada
  por RPC contra `_auth`.
- **Deploy**: UN SOLO Cloudflare Worker. URL: `panel.sivocloud.dev/`.

## Quick start

```bash
bun install
cp .env.example .env.development

bun run dev:dev    # [auth] :3031 (reusa si ya está) + astro dev :3034
# UI: https://localhost:3034/  (HTTPS con mkcert: Paddle lo exige)
```

> Necesitás `_auth` en `:3031` (el portal NO emite cookies, solo las consume
> vía RPC). `bun run dev:dev` lo levanta si no está. El modo dev habla con el
> `_auth` local vía un fake binding (no hay Service Binding en workerd local).

## Estructura

```
src/                 ← la UI: middleware, layouts, pages, components, islands
backend/
├── fe.mjs           ← flow-engine (flows portal.*)
├── flows/           ← *.flow.json (reads y writes)
├── nodes/portal/    ← nodos RPC (env.AUTH)
└── src/             ← env.mjs, identity.mjs, fake-auth-binding.mjs
scripts/             ← dev-backend.mjs, smoke.mjs
```

## Agregar una sección

Ver AGENTS.md §"Agregar una sección": flow read JSON + página `.astro` con
`runFlow`, endpoint POST + PRG para los writes y entrada en `src/lib/nav.ts`.

## Validar

```bash
bun run check     # lint-flows + audit-nodes + astro check
bun run smoke     # Chrome headless contra un build (astro preview): CSP, SSR, isla
```

## Deploy

```bash
wrangler deploy --env prod
```

Deployar `_auth` antes que `_portal` (el binding `AUTH` apunta a
`sivocloud-auth`).

# SIVOCLOUD Portal

Portal admin de SIVOCLOUD — `apps.sivocloud.dev/portal/*`.

**La prueba viva del patrón zero-secrets**: este worker **NO** tiene
`TURSO_CONTROL_PLANE_*`, `CONTROL_PLANE_ENCRYPTION_KEY`, ni DB bindings
de plataforma. Solo `env.AUTH` Service Binding RPC contra `_auth`.

Toda metadata de tenant/apps viene via RPC:
- `env.AUTH.getTenantInfo({cookie})` → tenant metadata
- `env.AUTH.getInstalledApps({cookie})` → lista apps instaladas
- `env.AUTH.verifySession(cookie)` → auth claims (via middleware Hono)

## Stack

- **Backend**: Hono 4 + `@sivo/flow-engine` 2.8.1 (CF Worker)
- **Frontend**: Svelte 5 + Vite 7 + Tailwind v4 + DaisyUI 5
- **Auth**: cookie `__Secure-sivocloud_session` (cross-subdomain)
- **Deploy**: UN SOLO Cloudflare Worker per-app. URL: `apps.sivocloud.dev/portal/*`

## Quick start

```bash
# deps
bun install
bun --cwd frontend install

# dev (auto-injects /api proxy to backend)
bun run dev   # levanta _auth (:3031) + backend (:3032 — opcional) + portal (:3034 o 5177)
```

> Para dev local **necesitas** `_auth` corriendo en `:3031` (login +
> pick-tenant) — el portal NO emite cookies, solo las consume via RPC
> al broker. Sin `_auth`, login falla.

## Cómo agregar un endpoint

### Endpoint que consume RPC del broker

1. **Custom node** en `backend/nodes/auth/portal-X.js`:
   ```js
   export default {
     type: 'portal-x',
     inputs: 1, outputs: 2,
     defaults: {},
     async execute(node, msg, ctx) {
       const cookieValue = readSessionCookie(ctx?.env?.cookieHeader || '')
       const result = await ctx.env.AUTH.someRpc({ cookie: cookieValue, ...args })
       return [{ ...msg, payload: { data: result } }, null]
     },
   }
   ```

2. **Flow** en `backend/flows/portal-x.flow.json`:
   ```json
   [
     { "id": "in", "type": "http-in", "method": "GET", "path": "/portal/x", "wires": [["do"]] },
     { "id": "do", "type": "portal-x", "wires": [["resp"], ["err401"]] },
     { "id": "resp", "type": "http-response", "statusCode": "200", "wires": [[]] },
     { "id": "err401", "type": "http-response", "statusCode": "401", "wires": [[]] }
   ]
   ```

3. **Registrar** en `backend/nodes/index.js` + `backend/fe.mjs` FLOWS map.

## Deploy

```bash
bun run build:worker      # esbuild backend → dist/worker.mjs
cd frontend && bun run build  # Svelte → frontend/dist/
wrangler deploy --env prod
```

## Zero secrets (Phase 4)

`wrangler secret list --env prod` retorna `[]` (vacío). El portal solo
tiene `env.AUTH` (Service Binding) y `env.ASSETS` (CF Assets).

Si este worker fuera comprometido, el atacante NO podría:
- Listar todos los tenants / owners.
- Leer credenciales cifradas de OTROS tenants.
- Modificar planes / activar apps.
- Mintear sesiones propias (no tiene `SESSION_SECRET`).

Solo podría ver la metadata del tenant actual (un único cookie de sesión).

## Phase 4 status (2026-09-14)

- ✅ `/portal/` (SPA shell)
- ✅ `/portal/api/health` → 200, zeroSecrets:true
- ✅ `/portal/api/portal/me` → tenant metadata
- ✅ `/portal/api/portal/apps` → installed apps
- ⏳ Owner/admin UI (CRUD tenants, billing, audit log) — fuera de Phase 4

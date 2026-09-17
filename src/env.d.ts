/// <reference types="astro/client" />

/**
 * Tipos del worker.
 *
 * `cloudflare:workers` y `SIVO_ENV` se declaran a mano: los bindings todavía
 * no están tipados (cuando haga falta, `wrangler types` genera el `Env` real).
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, any>
}

/** Bindings del worker, publicados para el backend (`src/lib/env.mjs` los lee). */
declare var SIVO_ENV: Record<string, any> | undefined

/**
 * Fake de `env.AUTH` en dev (el `_auth` local corre por HTTP en :3031). Lo
 * inyecta `src/middleware.ts` cuando el Service Binding real no existe.
 */
declare var __SIVO_DEV_AUTH__: any

/**
 * Locals del worker: la identidad resuelta por `src/middleware.ts`.
 * Las páginas leen `Astro.locals.identity` para renderizar.
 */
interface SivoIdentity {
  claims: Record<string, any>
  user: { id: string; role: string }
}

declare namespace App {
  interface Locals {
    identity: SivoIdentity | null
  }
}

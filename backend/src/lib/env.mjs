/**
 * backend/src/lib/env.mjs — Abstracción de variables de entorno.
 *
 * En Node.js (dev/prod local): lee process.env.
 * En CF Workers: lee globalThis.SIVO_ENV (seteado por worker-entry.js).
 *
 * Phase 4 (2026-09-14): _portal NO necesita TURSO_CONTROL_PLANE_*,
 * CONTROL_PLANE_ENCRYPTION_KEY, SESSION_SECRET ni DB bindings. Cero
 * secrets de plataforma. Solo vars de config trivial.
 *
 * Convención: NO leer process.env.X directo en ningún archivo de backend.
 */

const KEYS = [
  'APP_DOMAIN',
  'NODE_ENV',
  'AUTH_PORT',
  'PORT',
  // Bases browser-visibles para links (logout / abrir app). En prod apuntan
  // a auth.sivocloud.dev y apps.sivocloud.dev; en dev se overridean.
  'AUTH_BASE',
  'APPS_BASE',
  // Override per-app (dev): cada app local corre en su propio puerto, así que
  // `APPS_BASE` (un solo host) no alcanza. JSON: { "<slug>": "<base>" }.
  'APP_BASES',
  // TLS dev-only (Paddle.js exige secure context). Rutas a cert/key (mkcert).
  // Vacías en prod (lo termina Cloudflare).
  'DEV_TLS_CERT',
  'DEV_TLS_KEY',
];

function readEnv() {
  if (typeof globalThis !== 'undefined' && globalThis.SIVO_ENV) {
    const out = {};
    for (const k of KEYS) out[k] = globalThis.SIVO_ENV[k] || '';
    return out;
  }
  const out = {};
  for (const k of KEYS) out[k] = process.env[k] || '';
  return out;
}

let cached = null;
let cacheTime = 0;
const CACHE_TTL_MS = 1000;

export function getEnv() {
  if (cached && Date.now() - cacheTime < CACHE_TTL_MS) return cached;
  cached = readEnv();
  cacheTime = Date.now();
  return cached;
}

export function resetEnvCache() {
  cached = null;
  cacheTime = 0;
}

export function getEnvVar(key) {
  return getEnv()[key] || '';
}

export const DEFAULT_AUTH_BASE = 'https://auth.sivocloud.dev';
export const DEFAULT_APPS_BASE = 'https://apps.sivocloud.dev';

export function getAuthBase() {
  return getEnv().AUTH_BASE || DEFAULT_AUTH_BASE;
}

export function getAppsBase() {
  return getEnv().APPS_BASE || DEFAULT_APPS_BASE;
}

/**
 * Bases por app (override de `APPS_BASE`) para links "Abrir".
 * `APP_BASES` = JSON `{ "<slug>": "<base>" }`; vacío en prod (usa APPS_BASE).
 */
export function getAppBases() {
  const raw = getEnv().APP_BASES;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

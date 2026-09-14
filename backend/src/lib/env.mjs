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

#!/usr/bin/env bun
/**
 * patch-deployed-wrangler.mjs — Patch el wrangler.json que genera el CF vite plugin.
 *
 * Mismo workaround que apps/sivo-pos/scripts/patch-deployed-wrangler.mjs:
 * el CF vite plugin genera wrangler.json SIN el bloque env. Hay que
 * inyectar `env.prod.services` (binding AUTH) antes del deploy, sino
 * cada request autenticada devuelve 401 (RPC binding indefinido).
 *
 * Uso: bun run scripts/patch-deployed-wrangler.mjs (corre antes de deploy).
 * Idempotente.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const TARGET = path.resolve(
  import.meta.dirname,
  '..',
  'frontend',
  'dist',
  'sivopos_app',
  'wrangler.json',
);

if (!existsSync(TARGET)) {
  console.error(`❌ No existe ${TARGET}. Corré \`bun run build:worker\` primero.`);
  process.exit(1);
}

const d = JSON.parse(readFileSync(TARGET, 'utf8'));

// Idempotente: si ya tiene env.prod.services con AUTH, no tocar.
if (d.env?.prod?.services?.some((s) => s.binding === 'AUTH')) {
  console.log('✓ env.prod.services ya patcheado (binding AUTH presente).');
  process.exit(0);
}

const prod = {
  services: [{ binding: 'AUTH', service: 'sivocloud-auth' }],
  vars: {
    APP_DOMAIN: 'apps.sivocloud.dev',
    NODE_ENV:   'production',
  },
};

d.env = d.env || {};
d.env.prod = { ...(d.env.prod || {}), ...prod };

writeFileSync(TARGET, JSON.stringify(d, null, 2));
console.log(`✓ Patched ${path.relative(process.cwd(), TARGET)}`);
console.log(`  → env.prod.services: ${JSON.stringify(prod.services)}`);

#!/usr/bin/env bun
/**
 * dev-backend.mjs — Levanta el backend server-rendered (HTMX) del portal.
 *
 * Procesos:
 *   [auth]  _auth en :3031   → login + RPC (getTenantInfo, getInstalledApps).
 *                              Si ya está corriendo, se reusa.
 *   [be]    portal en :3034  → Hono + flow-engine. Sirve TODO: páginas HTML
 *                              (flow ui.portal), fragmentos HTMX, assets
 *                              estáticos (/ui/static/*) y la API JSON.
 *
 * NO hay vite ni frontend separado: la UI vive en el backend.
 *
 * Uso:
 *   bun run dev:dev
 *   BE_PORT=3035 bun run dev:dev
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(APP_ROOT, '..');
const AUTH_DIR = path.join(REPO_ROOT, '_auth');
const BACKEND_DIR = path.join(APP_ROOT, 'backend');

const devEnv = process.env.DEV_ENV || 'development';
const AUTH_PORT = Number(process.env.AUTH_PORT || 3031);
const BE_PORT = Number(process.env.BE_PORT || 3034);

const BACKEND_ENV_FILE = path.join(APP_ROOT, `.env.${devEnv}`);

const TAG = { auth: '\x1b[35m[auth]\x1b[0m', be: '\x1b[36m[be]\x1b[0m' };

function checkPortOpen(port) {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host: '127.0.0.1' }, () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.setTimeout(500, () => { sock.destroy(); resolve(false); });
  });
}

async function waitForPort(port, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await checkPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function spawnWithPrefix(name, cmd, args, opts = {}) {
  const child = spawn(cmd, args, { ...opts, env: { ...process.env, ...(opts.env || {}) } });
  const tag = TAG[name];
  const pipe = (stream) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) if (line.trim()) process.stdout.write(`${tag} ${line}\n`);
    });
    stream.on('end', () => { if (buf.trim()) process.stdout.write(`${tag} ${buf}\n`); });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  return child;
}

let auth, be, shuttingDown = false;

function cleanup(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[dev-backend] shutting down...');
  try { be?.kill('SIGTERM'); } catch {}
  try { auth?.kill('SIGTERM'); } catch {}
  setTimeout(() => {
    try { be?.kill('SIGKILL'); } catch {}
    try { auth?.kill('SIGKILL'); } catch {}
    process.exit(code);
  }, 3000);
}

process.on('SIGINT', () => cleanup(130));
process.on('SIGTERM', () => cleanup(143));

if (!existsSync(BACKEND_ENV_FILE)) {
  console.error(`[dev-backend] falta env file: ${BACKEND_ENV_FILE}`);
  console.error(`[dev-backend] copiá .env.example → .env.${devEnv}`);
  process.exit(1);
}

// Inlinea islands (JS cliente) → backend/src/ui/islands-inline.mjs.
try {
  await new Promise((resolve) => {
    const c = spawnWithPrefix('be', 'bun', ['scripts/gen-islands-inline.mjs'], { cwd: APP_ROOT });
    c.on('exit', resolve);
  });
} catch { /* no fatal */ }

console.log(`[dev-backend] env : ${devEnv}`);
console.log(`[dev-backend] auth: http://localhost:${AUTH_PORT}`);
console.log(`[dev-backend] be  : http://localhost:${BE_PORT}`);

if (await checkPortOpen(AUTH_PORT)) {
  console.log(`[dev-backend] _auth ya está en :${AUTH_PORT} — reuso`);
} else {
  console.log(`[dev-backend] arrancando _auth (:${AUTH_PORT}) via wrangler dev...`);
  auth = spawnWithPrefix('auth', 'bun', ['run', 'dev:dev'], { cwd: AUTH_DIR, env: { PORT: String(AUTH_PORT) } });
  auth.on('exit', (code) => {
    if (!shuttingDown && code !== 0) { console.error(`[dev-backend] _auth salió con ${code}. Abortando.`); cleanup(code ?? 1); }
  });
  if (!(await waitForPort(AUTH_PORT))) { console.error('[dev-backend] _auth no levantó.'); cleanup(1); }
  console.log('[dev-backend] _auth listo');
}

console.log(`[dev-backend] arrancando portal (:${BE_PORT})...`);
be = spawnWithPrefix('be', 'bun', ['--env-file', BACKEND_ENV_FILE, 'server.js'], {
  cwd: BACKEND_DIR,
  env: { PORT: String(BE_PORT), AUTH_PORT: String(AUTH_PORT) },
});
be.on('exit', (code) => { if (!shuttingDown) cleanup(code ?? 0); });
if (!(await waitForPort(BE_PORT))) { console.error('[dev-backend] portal no levantó.'); cleanup(1); }
console.log(`[dev-backend] portal listo en :${BE_PORT}`);
console.log(`[dev-backend] abrí http://localhost:${BE_PORT}/`);

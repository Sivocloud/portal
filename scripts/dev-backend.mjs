#!/usr/bin/env bun
/**
 * dev-backend.mjs — Levanta el backend del portal en dev.
 *
 * Procesos:
 *   [auth]  _auth en :3031   → login + RPC (getTenantInfo, getInstalledApps).
 *                              Si ya está corriendo, se reusa.
 *   [be]    portal en :3034  → `astro dev` (workerd vía @astrojs/cloudflare).
 *                              El Service Binding AUTH no existe localmente:
 *                              el middleware monta el fake HTTP contra _auth.
 *
 * Uso:
 *   bun run dev:dev
 *   BE_PORT=3035 bun run dev:dev
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(APP_ROOT, '..');
const AUTH_DIR = path.join(REPO_ROOT, '_auth');

const devEnv = process.env.DEV_ENV || 'development';
const AUTH_PORT = Number(process.env.AUTH_PORT || 3031);
const BE_PORT = Number(process.env.BE_PORT || 3034);

const BACKEND_ENV_FILE = path.join(APP_ROOT, `.env.${devEnv}`);

const TAG = { auth: '\x1b[35m[auth]\x1b[0m', be: '\x1b[36m[be]\x1b[0m' };

function checkPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host }, () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.setTimeout(500, () => { sock.destroy(); resolve(false); });
  });
}

/**
 * Espera a que el puerto escuche, en IPv4 **o** IPv6. `astro dev` (Node/Vite)
 * bindea solo `[::1]` en macOS, así que chequear 127.0.0.1 solo daba un falso
 * "no levantó" y el orchestrator mataba el server.
 */
async function portListening(port) {
  return (await checkPortOpen(port, '127.0.0.1')) || (await checkPortOpen(port, '::1'));
}

async function waitForPort(port, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await portListening(port)) return true;
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

// El portal sirve HTTPS si existen los certs de mkcert (Paddle.js exige
// secure context; los lee `astro.config.mjs` vía `vite.server.https`).
const certPath = path.join(APP_ROOT, '..', '.certs', 'localhost.pem');
const beScheme = existsSync(certPath) ? 'https' : 'http';

console.log(`[dev-backend] env : ${devEnv}`);
console.log(`[dev-backend] auth: http://localhost:${AUTH_PORT}`);
console.log(`[dev-backend] be  : ${beScheme}://localhost:${BE_PORT}`);

if (await portListening(AUTH_PORT)) {
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

// ASTRO_DEV_BACKGROUND: a pesar del nombre, seteado fuerza el modo FOREGROUND
// (desactiva la autodetección de agente de `astro dev`, que si no lo manda a
// segundo plano y el orchestrator no puede matarlo).
console.log(`[dev-backend] arrancando portal (:${BE_PORT}) con astro dev...`);
be = spawnWithPrefix('be', 'bun', ['x', 'astro', 'dev', '--port', String(BE_PORT)], {
  cwd: APP_ROOT,
  env: { ASTRO_DEV_BACKGROUND: '1' },
});
be.on('exit', (code) => { if (!shuttingDown) cleanup(code ?? 0); });
// `astro dev` tarda ~20s en compilar el primer bundle en workerd.
if (!(await waitForPort(BE_PORT, 120000))) { console.error('[dev-backend] portal no levantó.'); cleanup(1); }
console.log(`[dev-backend] portal listo en :${BE_PORT}`);
console.log(`[dev-backend] abrí ${beScheme}://localhost:${BE_PORT}/`);

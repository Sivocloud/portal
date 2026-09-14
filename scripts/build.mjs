#!/usr/bin/env bun
/**
 * scripts/build.mjs — Bundle del worker para deploy a CF.
 *
 * Compila backend/worker-entry.js → dist/worker.mjs via esbuild.
 * En prod CF bundlea esto + frontend/dist/* (vite plugin).
 *
 * Patrón idéntico a apps/sivo-pos/scripts/build.mjs y _controlplane/scripts/build.mjs.
 */

import { build } from 'esbuild'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import path from 'node:path'

const DIST = path.resolve('./dist')
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true })

const start = Date.now()

const result = await build({
  entryPoints: [path.resolve('./backend/worker-entry.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  external: ['node:*', 'fs', 'path', 'crypto'],
  minify: true,
  outfile: path.join(DIST, 'worker.mjs'),
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
})

const size = statSync(path.join(DIST, 'worker.mjs')).size
console.log(`[build] ${(size / 1024).toFixed(1)}kb → ${path.relative(process.cwd(), path.join(DIST, 'worker.mjs'))} (${Date.now() - start}ms)`)
console.log(`[build] done. metafile written to dist/.meta.json (for analysis).`)

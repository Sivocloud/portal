import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  base: '/portal/',
  server: {
    port: 5177,
    proxy: {
      '/portal/api': {
        target: 'http://localhost:3034',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/portal/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    // svelte resuelve su entry `.` contra las condiciones worker/browser/
    // default. Vite 7 no activa `browser` por defecto en este build y caía
    // en el server entry (`mount` stub que tira lifecycle_function_unavailable).
    // Forzar `browser` para que main.js monte el runtime de cliente.
    conditions: ['module', 'browser', 'import', 'development|production'],
  },
});

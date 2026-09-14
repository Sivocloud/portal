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
});

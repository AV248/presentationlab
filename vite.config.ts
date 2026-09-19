import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Presentation Buddy is a fully static, offline-capable single page app.
// It is built to be served from any host (or even opened from a file path),
// so the router uses hash URLs and all assets are referenced relatively.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    // The sandbox preview proxies the dev server behind an https host, so
    // allow any hostname to reach it.
    allowedHosts: true,
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2020',
    cssTarget: 'chrome100',
    chunkSizeWarningLimit: 900,
  },
});

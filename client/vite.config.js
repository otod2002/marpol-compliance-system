import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    // The service worker precaches the application shell, so the client
    // launches with no network at all (FR-26, verified by TO-02).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'MARPOL Field Inspection',
        short_name: 'MARPOL Field',
        description: 'NIMASA MARPOL compliance inspection, operable offline aboard a vessel.',
        theme_color: '#0A1E2D',
        background_color: '#0A1E2D',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // The instrument pack is cached so an inspection can begin with
            // no connection. Stale content is preferable to no instrument.
            urlPattern: /\/api\/instrument\/active/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'instrument-pack', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: /\/api\/(auth|inspections|waste-notes)/,
            handler: 'NetworkOnly',   // never serve a stale write path
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared') },
  },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: true } },
  },
});

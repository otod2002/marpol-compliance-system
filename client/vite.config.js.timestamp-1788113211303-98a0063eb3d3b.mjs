// vite.config.js
import { defineConfig } from "file:///home/claude/marpol-compliance-system/client/node_modules/vite/dist/node/index.js";
import react from "file:///home/claude/marpol-compliance-system/client/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///home/claude/marpol-compliance-system/client/node_modules/vite-plugin-pwa/dist/index.js";
import path from "node:path";
var __vite_injected_original_dirname = "/home/claude/marpol-compliance-system/client";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    // The service worker precaches the application shell, so the client
    // launches with no network at all (FR-26, verified by TO-02).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "MARPOL Field Inspection",
        short_name: "MARPOL Field",
        description: "NIMASA MARPOL compliance inspection, operable offline aboard a vessel.",
        theme_color: "#0A1E2D",
        background_color: "#0A1E2D",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            // The instrument pack is cached so an inspection can begin with
            // no connection. Stale content is preferable to no instrument.
            urlPattern: /\/api\/instrument\/active/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "instrument-pack", expiration: { maxEntries: 4 } }
          },
          {
            urlPattern: /\/api\/(auth|inspections|waste-notes)/,
            handler: "NetworkOnly"
            // never serve a stale write path
          }
        ]
      },
      devOptions: { enabled: true, type: "module" }
    })
  ],
  resolve: {
    alias: { "@shared": path.resolve(__vite_injected_original_dirname, "../shared") }
  },
  server: {
    port: 5174,
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: true } }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9jbGF1ZGUvbWFycG9sLWNvbXBsaWFuY2Utc3lzdGVtL2NsaWVudFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvY2xhdWRlL21hcnBvbC1jb21wbGlhbmNlLXN5c3RlbS9jbGllbnQvdml0ZS5jb25maWcuanNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvY2xhdWRlL21hcnBvbC1jb21wbGlhbmNlLXN5c3RlbS9jbGllbnQvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgeyBWaXRlUFdBIH0gZnJvbSAndml0ZS1wbHVnaW4tcHdhJztcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCc7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIC8vIFRoZSBzZXJ2aWNlIHdvcmtlciBwcmVjYWNoZXMgdGhlIGFwcGxpY2F0aW9uIHNoZWxsLCBzbyB0aGUgY2xpZW50XG4gICAgLy8gbGF1bmNoZXMgd2l0aCBubyBuZXR3b3JrIGF0IGFsbCAoRlItMjYsIHZlcmlmaWVkIGJ5IFRPLTAyKS5cbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLnN2ZyddLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogJ01BUlBPTCBGaWVsZCBJbnNwZWN0aW9uJyxcbiAgICAgICAgc2hvcnRfbmFtZTogJ01BUlBPTCBGaWVsZCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnTklNQVNBIE1BUlBPTCBjb21wbGlhbmNlIGluc3BlY3Rpb24sIG9wZXJhYmxlIG9mZmxpbmUgYWJvYXJkIGEgdmVzc2VsLicsXG4gICAgICAgIHRoZW1lX2NvbG9yOiAnIzBBMUUyRCcsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6ICcjMEExRTJEJyxcbiAgICAgICAgZGlzcGxheTogJ3N0YW5kYWxvbmUnLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3BvcnRyYWl0LXByaW1hcnknLFxuICAgICAgICBzdGFydF91cmw6ICcvJyxcbiAgICAgICAgc2NvcGU6ICcvJyxcbiAgICAgICAgaWNvbnM6IFtcbiAgICAgICAgICB7IHNyYzogJ2ljb24tMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnIH0sXG4gICAgICAgICAgeyBzcmM6ICdpY29uLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnaWNvbi01MTIucG5nJywgc2l6ZXM6ICc1MTJ4NTEyJywgdHlwZTogJ2ltYWdlL3BuZycsIHB1cnBvc2U6ICdtYXNrYWJsZScgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxzdmcscG5nLHdvZmYyfSddLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiAnaW5kZXguaHRtbCcsXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gVGhlIGluc3RydW1lbnQgcGFjayBpcyBjYWNoZWQgc28gYW4gaW5zcGVjdGlvbiBjYW4gYmVnaW4gd2l0aFxuICAgICAgICAgICAgLy8gbm8gY29ubmVjdGlvbi4gU3RhbGUgY29udGVudCBpcyBwcmVmZXJhYmxlIHRvIG5vIGluc3RydW1lbnQuXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXFwvYXBpXFwvaW5zdHJ1bWVudFxcL2FjdGl2ZS8sXG4gICAgICAgICAgICBoYW5kbGVyOiAnU3RhbGVXaGlsZVJldmFsaWRhdGUnLFxuICAgICAgICAgICAgb3B0aW9uczogeyBjYWNoZU5hbWU6ICdpbnN0cnVtZW50LXBhY2snLCBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDQgfSB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXJsUGF0dGVybjogL1xcL2FwaVxcLyhhdXRofGluc3BlY3Rpb25zfHdhc3RlLW5vdGVzKS8sXG4gICAgICAgICAgICBoYW5kbGVyOiAnTmV0d29ya09ubHknLCAgIC8vIG5ldmVyIHNlcnZlIGEgc3RhbGUgd3JpdGUgcGF0aFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczogeyBlbmFibGVkOiB0cnVlLCB0eXBlOiAnbW9kdWxlJyB9LFxuICAgIH0pLFxuICBdLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHsgJ0BzaGFyZWQnOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnLi4vc2hhcmVkJykgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3NCxcbiAgICBwcm94eTogeyAnL2FwaSc6IHsgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDo0MDAwJywgY2hhbmdlT3JpZ2luOiB0cnVlIH0gfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFzVCxTQUFTLG9CQUFvQjtBQUNuVixPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sVUFBVTtBQUhqQixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUE7QUFBQTtBQUFBLElBR04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGFBQWE7QUFBQSxNQUM3QixVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUEsUUFDVCxhQUFhO0FBQUEsUUFDYixXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsVUFDTCxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sV0FBVyxNQUFNLFlBQVk7QUFBQSxVQUMzRCxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sV0FBVyxNQUFNLFlBQVk7QUFBQSxVQUMzRCxFQUFFLEtBQUssZ0JBQWdCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxXQUFXO0FBQUEsUUFDbEY7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUCxjQUFjLENBQUMsa0NBQWtDO0FBQUEsUUFDakQsa0JBQWtCO0FBQUEsUUFDbEIsZ0JBQWdCO0FBQUEsVUFDZDtBQUFBO0FBQUE7QUFBQSxZQUdFLFlBQVk7QUFBQSxZQUNaLFNBQVM7QUFBQSxZQUNULFNBQVMsRUFBRSxXQUFXLG1CQUFtQixZQUFZLEVBQUUsWUFBWSxFQUFFLEVBQUU7QUFBQSxVQUN6RTtBQUFBLFVBQ0E7QUFBQSxZQUNFLFlBQVk7QUFBQSxZQUNaLFNBQVM7QUFBQTtBQUFBLFVBQ1g7QUFBQSxRQUNGO0FBQUEsTUFDRjtBQUFBLE1BQ0EsWUFBWSxFQUFFLFNBQVMsTUFBTSxNQUFNLFNBQVM7QUFBQSxJQUM5QyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTyxFQUFFLFdBQVcsS0FBSyxRQUFRLGtDQUFXLFdBQVcsRUFBRTtBQUFBLEVBQzNEO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEseUJBQXlCLGNBQWMsS0FBSyxFQUFFO0FBQUEsRUFDM0U7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=

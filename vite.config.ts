import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' — a new deploy's service worker takes over and
      // refreshes the app shell in the background automatically. Nothing
      // extra to wire up in the UI; API calls are excluded from the
      // precache below regardless, so game/payment data is never stale.
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'Earn Master',
        short_name: 'Earn Master',
        description: 'Tap-to-earn Earn Master — mine coins, complete tasks, and cash out.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Matches the app shell background (#1c1f24) so there's no flash of
        // white/wrong color during launch on Android/iOS.
        background_color: '#1c1f24',
        theme_color: '#1c1f24',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built app shell only — API calls (/api/*, /webhooks/*)
        // are never cached, so balances/tasks/payments always hit the network.
        navigateFallbackDenylist: [/^\/api\//, /^\/webhooks\//],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.SERVER_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
})

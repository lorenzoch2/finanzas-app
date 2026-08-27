import { fileURLToPath, URL } from 'node:url';
// defineConfig de vitest/config, no de vite: es la que acepta la clave `test`.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt', no 'autoUpdate': una recarga automática a mitad de una
      // boleta de veinte ítems te haría perder lo escrito. Con prompt, la
      // versión nueva espera y AvisoActualizacion te deja elegir cuándo.
      // Antes esto estaba en 'prompt' SIN interfaz que avisara, con lo que la
      // actualización se quedaba esperando para siempre y el teléfono seguía
      // mostrando la versión vieja.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Finanzapp',
        short_name: 'Finanzapp',
        description: 'Gestión de finanzas personales',
        lang: 'es-CL',
        start_url: '/',
        display: 'standalone',
        background_color: '#f8fbff',
        theme_color: '#1669ef',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Las respuestas de Supabase NUNCA se cachean: mostrar un saldo viejo
        // como si fuera el actual es peor que no mostrar nada.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});

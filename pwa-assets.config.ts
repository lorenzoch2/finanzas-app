import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Genera el juego de iconos de la PWA desde public/icon.png.
 *
 * El icono original es una billetera negra sobre fondo transparente, a
 * 1024x1024. Tal cual daba tres problemas: el manifest declaraba 512x512
 * (mentía), en iOS la transparencia se rellena de negro, y usarlo como
 * `maskable` hacía que Android le recortara los bordes, porque un icono
 * maskable necesita ~20% de margen de seguridad.
 *
 * El preset genera los tamaños correctos y una versión maskable con el
 * margen adecuado sobre fondo opaco.
 *
 *   npm run iconos
 */
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      // Fondo del manifest, para que la billetera negra se lea bien.
      resizeOptions: { background: '#f8fbff', fit: 'contain' },
    },
    apple: {
      ...minimal2023Preset.apple,
      // iOS no respeta la transparencia: sin fondo explícito sale en negro.
      resizeOptions: { background: '#f8fbff', fit: 'contain' },
    },
  },
  images: ['public/icon.png'],
});

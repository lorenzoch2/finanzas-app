# Finanzapp

Finanzapp es una aplicación web para la gestión personal de finanzas, desarrollada con React, Vite y Supabase. Permite registrar, auditar y visualizar movimientos, fuentes de ingreso, saldos y categorías, todo en una interfaz flexible y moderna.

## Características
- Registro de transacciones y movimientos económicos.
- Gestión de fuentes, saldos, ajustes y categorías.
- Dashboard con resumen y análisis temporal.
- Integración con Supabase para almacenamiento en la nube.
- Estilos modernos con Tailwind CSS.

## Instalación

1. Clona el repositorio y entra a la carpeta del proyecto:
   ```bash
   git clone TU_REPO_URL
   cd finanzas_app
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Crea un archivo `.env.local` con las variables necesarias:
   ```env
   VITE_SUPABASE_URL=tu_url
   VITE_SUPABASE_ANON_KEY=tu_key
   ```
4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
5. Abre [http://localhost:5173](http://localhost:5173) en tu navegador (por ejemplo, en Brave).

## Scripts útiles
- `npm run dev`: Ejecuta la app en modo desarrollo.
- `npm run build`: Genera el build de producción.
- `npm run lint`: Ejecuta ESLint sobre todo el código fuente.
- `npm run format`: Ejecuta Prettier para formatear el código.

## Calidad de código
Se utilizan ESLint y Prettier para mantener buenas prácticas, consistencia y reducir errores comunes. Se recomienda ejecutarlos periódicamente:

```bash
npm run lint
npm run format
```

---
Sugerencias, pull requests y mejoras son bienvenidas.

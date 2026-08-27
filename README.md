# Finanzapp

Gestión de finanzas personales. PWA mobile-first sobre React, Vite y Supabase.

Registra ingresos y egresos, detalla boletas ítem por ítem (producto, marca, gramaje, descuento) y
reconstruye el saldo de cada fuente de dinero a partir de ajustes manuales.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completa las dos variables
npm run dev
```

Las variables salen de tu proyecto en Supabase, en *Project Settings → API*:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

La app falla al arrancar si faltan, a propósito: antes solo avisaba por consola y seguía con
credenciales vacías, así que el error real aparecía mucho después disfrazado de "no se pudo cargar".

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Type-check y build de producción. |
| `npm run preview` | Sirve el build, útil para probar la PWA. |
| `npm run typecheck` | TypeScript en modo estricto, sin emitir. |
| `npm run test` | Suite de Vitest. |
| `npm run golden -- <dir>` | Recalcula los saldos con la lógica legacy desde un backup. |
| `npm run iconos` | Regenera el juego de iconos de la PWA desde `public/icon.png`. |

## Base de datos

El esquema se versiona en `supabase/migrations/`, en orden numérico. Sin el CLI de Supabase se
aplican pegando cada archivo en el *SQL editor* del proyecto.

**El orden importa y hay un requisito previo:** la migración `0001` adjudica todas las filas
existentes a tu usuario, así que tu cuenta debe existir antes. Crea la cuenta desde la pantalla de
login de la app y recién entonces aplica las migraciones.

| Migración | Qué hace |
|---|---|
| `0001_user_ownership` | Añade `user_id`, rellena las filas existentes y lo vuelve obligatorio. |
| `0002_rls` | Activa y fuerza RLS. Sin sesión, las tablas dejan de devolver datos. |
| `0003_integridad` | FKs con la regla de borrado correcta, CHECKs, índices y guarda de ciclos en categorías. |
| `0004_descuentos_y_precios` | `descuento_monto` pasa a ser la única fuente de verdad; el resto se genera. |
| `0005_gasto_sin_detalle` | Las filas fantasma pasan a ser una columna de la transacción. |
| `0006_saldos_rpc` | `saldos_por_fuente()` y `resumen_mensual()`. |
| `0007_guardar_transaccion` | Guardado y borrado atómicos. |
| `0008_cerrar_huecos` | Elimina `uso_productos`, que quedó sin RLS, y revoca `EXECUTE` de `PUBLIC`. |
| `0009_resumen_sin_duplicar` | `resumen_mensual` deja de recalcular los saldos; el total lo suma el cliente. |
| `0010_categorias_v3` | Taxonomía nueva de 10 categorías y 41 subcategorías, con los 93 ítems remapeados. |
| `0011_productos` | Catálogo de productos y unidades estructuradas; retira `peso_volumen`. |
| `0012_establecimientos` | Dónde se compró, para comparar locales. |
| `0013_transferencias` | Traspasos entre cuentas propias y cuenta principal. |
| `0014_presupuestos` | Límite de gasto mensual, con avance y proyección. |

Antes y después están `supabase/checks/pre-migration.sql` y `post-migration.sql`, que son solo
lectura y sirven para comparar conteos.

### Antes de migrar: respalda

```bash
node scripts/backup.mjs
```

Necesita `FINANZAPP_EMAIL` y `FINANZAPP_PASSWORD` en el entorno: desde que RLS está activo, la anon
key sola no lee nada.

`backups/` está fuera de git porque contiene montos reales. El *golden* que genera ese script es la
red de seguridad: los saldos que calcule la versión nueva deben coincidir dígito a dígito con los que
calculaba la anterior.

## Despliegue

Se despliega en Netlify desde el repositorio: cada push a la rama conectada publica una versión nueva.
La configuración está en `netlify.toml` y no hay que tocarla.

Lo único que se configura a mano, una vez, es en *Site settings → Environment variables*:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

No van en el repositorio. Sí acaban dentro del bundle publicado, y eso es correcto: la anon key está
pensada para ser pública. Lo que protege los datos es RLS. Comprobado: sin sesión iniciada, las
cinco tablas devuelven 401.

### Cómo se actualiza una vez instalada

El service worker está en modo `prompt`: cuando detecta una versión nueva la descarga pero **no** la
activa sola, y `AvisoActualizacion` muestra un aviso con un botón. Se prefiere preguntar a recargar
por sorpresa, porque una recarga a mitad de una boleta de veinte ítems se llevaría lo escrito.

Mientras la app está abierta comprueba si hay versión nueva cada hora; una PWA instalada puede pasar
días sin cerrarse del todo, y sin esa comprobación solo miraría al arrancar.

`netlify.toml` marca `sw.js` y el manifest como no cacheables. Es imprescindible: si el navegador
sirviera una copia vieja del service worker, la app quedaría congelada en esa versión sin forma de
actualizarse.

### Iconos

```bash
npm run iconos
```

Regenera el juego completo desde `public/icon.png`. Solo hace falta si cambias el icono original.

## Modelo de datos

- **`fuentes_cuentas`** — dónde está el dinero (cuenta, efectivo, crédito).
- **`transacciones`** — un ingreso o egreso. `monto_sin_detalle` guarda la parte de un gasto que no
  se desglosó.
- **`items_detalle`** — el desglose de una boleta. `descuento_monto` es el dinero ahorrado por
  unidad; `precio_final`, `descuento_porcentaje`, `tuvo_descuento` y `total_linea` son columnas
  generadas y no se pueden escribir.
- **`ajustes_saldos`** — declara cuánto había en una fuente en una fecha. Corta la línea temporal.
- **`categorias`** — árbol vía `parent_id`.

### Cómo se calcula un saldo

Para un mes dado, se toma el último ajuste de la fuente anterior al cierre de ese mes: define el
saldo inicial y la fecha base. Desde esa fecha se suman los ingresos y se restan los egresos hasta el
fin del mes. Sin ajuste, se parte de cero desde 2020-01-01.

El cálculo vive en `saldos_por_fuente()`, en la base. Antes ocurría en el navegador después de
descargar el historial completo de transacciones en cada render.

## Zona horaria

Todas las fechas se guardan en UTC y se interpretan con una zona explícita, configurable en
*Preferencias*. No se usa nunca la zona implícita de la máquina: por ahí entraba el error de mostrar
el mes equivocado durante las primeras horas del día 1.

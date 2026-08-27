/**
 * Regenera el SQL de la v3 y deja listo el archivo que se pega en Supabase.
 *
 *   node scripts/generar-sql.mjs
 *
 * Encadena tres cosas para que no se puedan desincronizar:
 *
 *   1. Genera 0010 y 0011 desde scripts/taxonomia.mjs.
 *   2. Junta 0010-0014 en un solo archivo.
 *   3. Lo convierte a ASCII puro.
 *
 * El paso 3 no es cosmético. Al copiar SQL al portapapeles desde Windows
 * PowerShell, `Get-Content` lee en ANSI y rompe el UTF-8: «Alimentación»
 * llega como «Alimentaci??n». En un comentario da igual, pero en un literal
 * que debe coincidir con un dato guardado, la consulta deja de encontrar nada
 * y no avisa. Escapando los literales a Unicode ASCII el archivo deja de
 * depender de cómo se copie.
 *
 * Los archivos de supabase/migrations/ se quedan legibles, con sus tildes:
 * son el código fuente. El que se aplica es el generado.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { aAscii } from './sql-ascii.mjs';

const MIGRACIONES = [
  'supabase/migrations/0010_categorias_v3.sql',
  'supabase/migrations/0011_productos.sql',
  'supabase/migrations/0012_establecimientos.sql',
  'supabase/migrations/0013_transferencias.sql',
  'supabase/migrations/0014_presupuestos.sql',
];

const CABECERA = `-- =====================================================================
-- FINANZAPP v3 - MIGRACIONES PENDIENTES (0010 a 0014)
--
-- EJECUTALO ENTERO, DE UNA SOLA VEZ.
-- No selecciones un trozo: los bloques "do $$ ... $$" son indivisibles y
-- ejecutar medio bloque da el error "unterminated dollar-quoted string".
-- En el editor de Supabase, deja el cursor dentro sin seleccionar nada y
-- pulsa Run.
--
-- Este archivo es ASCII puro a proposito: los acentos van escapados como
-- U&'...\\00F3...', que Postgres interpreta como el caracter correcto. Asi
-- da igual como se copie, aunque el portapapeles rompa el UTF-8.
--
-- ANTES: haz el respaldo. Con RLS activo necesita sesion.
--   $env:FINANZAPP_EMAIL='tu@correo.cl'
--   $env:FINANZAPP_PASSWORD='tu contrasena'
--   node scripts/backup.mjs
--
-- Es seguro volver a ejecutarlo si algo falla a medias.
--
--   0010  Taxonomia nueva: 10 categorias y 41 subcategorias. Remapea los 93
--         items uno por uno. De 29% sin categoria a 0%.
--   0011  Catalogo de 75 productos y unidades estructuradas.
--   0012  Establecimientos, para comparar donde compras.
--   0013  Transferencias entre cuentas propias y cuenta principal.
--   0014  Limite de gasto mensual, con avance y proyeccion.
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla se revierte entero.
-- =====================================================================
`;

console.log('1. Generando SQL desde la taxonomia...');
for (const script of ['generar-migracion-categorias.mjs', 'generar-migracion-productos.mjs']) {
  const salida = execFileSync(process.execPath, [`scripts/${script}`], { encoding: 'utf8' });
  console.log(
    salida
      .trim()
      .split('\n')
      .map((l) => '   ' + l)
      .join('\n'),
  );
}

console.log('\n2. Juntando las migraciones...');
let combinado = CABECERA;
for (const ruta of MIGRACIONES) {
  const contenido = readFileSync(ruta, 'utf8');
  combinado += `\n-- ============================================================\n`;
  combinado += `-- ${basename(ruta)}\n`;
  combinado += `-- ============================================================\n`;
  combinado += contenido;
  combinado += '\n';
  console.log(`   ${basename(ruta)}`);
}

console.log('\n3. Convirtiendo a ASCII...');
const ascii = aAscii(combinado);

const noAscii = [...ascii].filter((c) => c.codePointAt(0) > 127);
if (noAscii.length) {
  console.error(`   FALLO: quedaron ${noAscii.length} caracteres no ASCII.`);
  process.exit(1);
}

const salida = 'supabase/APLICAR-PENDIENTES.sql';
writeFileSync(salida, ascii, 'ascii');

const bloques = (ascii.match(/^begin;/gm) ?? []).length;
const cierres = (ascii.match(/^commit;/gm) ?? []).length;
const escapes = (ascii.match(/U&'/g) ?? []).length;

console.log(`\nEscrito ${salida}`);
console.log(`   ${ascii.split('\n').length} lineas, todas ASCII`);
console.log(`   ${bloques} bloques begin / ${cierres} commit`);
console.log(`   ${escapes} literales con acentos escapados`);

if (bloques !== cierres) {
  console.error('\nFALLO: los begin y los commit no cuadran.');
  process.exit(1);
}

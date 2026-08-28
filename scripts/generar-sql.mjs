/**
 * Regenera el SQL de la v3 y deja listo el archivo que se pega en Supabase.
 *
 *   node scripts/generar-sql.mjs
 *
 * Encadena tres cosas para que no se puedan desincronizar:
 *
 *   1. Genera 0011 y 0012 desde scripts/taxonomia.mjs.
 *   2. Junta las migraciones pendientes en un solo archivo.
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

/**
 * Las migraciones que TODAVIA no se han aplicado.
 *
 * Se mantiene a mano y a proposito: es la unica forma de generar un archivo
 * que se pueda pegar entero sin volver a ejecutar lo ya aplicado. Cuando una
 * migracion entra en produccion, se saca de aqui.
 *
 * Aplicadas: 0001-0015.
 */
const MIGRACIONES = [
  'supabase/migrations/0016_analisis.sql',
  'supabase/migrations/0017_presupuestos_por_periodo.sql',
  'supabase/migrations/0018_rangos_de_fecha.sql',
];

const CABECERA = `-- =====================================================================
-- FINANZAPP v3 - MIGRACIONES PENDIENTES (0016 a 0018)
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
--   0016  Agregaciones para la vista de analisis.
--   0017  Presupuestos por periodo libre y por cuenta. Migra el limite
--         mensual que hubiera al periodo equivalente.
--   0018  Todas las consultas pasan a recibir un rango de fechas en vez de
--         un mes. El mes deja de estar incrustado y pasa a ser el rango mas
--         habitual, no el unico posible.
--
-- Solo 0017 toca datos, y solo para trasladar el limite mensual anterior a
-- su periodo equivalente. El resto crea o reemplaza funciones.
--
-- IMPORTANTE: aplicalo junto con la version desplegada de la app. Las
-- funciones cambian de firma, asi que una version antigua dejaria de
-- encontrarlas.
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

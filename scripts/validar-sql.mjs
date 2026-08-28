/**
 * Comprobaciones estructurales del SQL generado, antes de dárselo a nadie.
 *
 * No sustituye a ejecutarlo, pero atrapa los fallos que ya nos costaron un
 * viaje cada uno:
 *
 *   1. Caracteres fuera de ASCII, que el portapapeles de PowerShell rompe.
 *   2. Bloques con comillas de dólar o literales sin cerrar.
 *   3. RAISE con un literal escapado, que PL/pgSQL no acepta.
 *   4. CTE con columnas sin nombre a las que luego se referencia.
 *
 *   node scripts/validar-sql.mjs supabase/APLICAR-PENDIENTES.sql
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2] ?? 'supabase/APLICAR-PENDIENTES.sql';
const sql = readFileSync(ruta, 'latin1');

const problemas = [];
const lineaDe = (indice) => sql.slice(0, indice).split('\n').length;

// --- 1) Todo ASCII ---
const noAscii = [...sql].filter((c) => c.codePointAt(0) > 127);
if (noAscii.length) {
  problemas.push(`${noAscii.length} caracteres no ASCII: ${[...new Set(noAscii)].join(' ')}`);
}

// --- 2) Recorrido: literales, comentarios y bloques con comillas de dólar ---
let i = 0;
let dolares = 0;
let literales = 0;
let linea = 1;

while (i < sql.length) {
  const resto = sql.slice(i);

  if (sql[i] === '\n') {
    linea += 1;
    i += 1;
    continue;
  }

  if (resto.startsWith('--')) {
    const fin = sql.indexOf('\n', i);
    i = fin === -1 ? sql.length : fin;
    continue;
  }

  if (resto.startsWith('/*')) {
    const fin = sql.indexOf('*/', i + 2);
    if (fin === -1) {
      problemas.push(`Comentario de bloque sin cerrar en la linea ${linea}`);
      break;
    }
    linea += sql.slice(i, fin).split('\n').length - 1;
    i = fin + 2;
    continue;
  }

  const dolar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(resto);
  if (dolar) {
    const marca = dolar[0];
    const fin = sql.indexOf(marca, i + marca.length);
    if (fin === -1) {
      problemas.push(`Bloque ${marca} sin cerrar, abierto en la linea ${linea}`);
      break;
    }
    dolares += 1;
    linea += sql.slice(i, fin + marca.length).split('\n').length - 1;
    i = fin + marca.length;
    continue;
  }

  if (sql[i] === "'") {
    let j = i + 1;
    while (j < sql.length) {
      if (sql[j] === "'" && sql[j + 1] === "'") {
        j += 2;
        continue;
      }
      if (sql[j] === "'") break;
      if (sql[j] === '\n') linea += 1;
      j += 1;
    }
    if (j >= sql.length) {
      problemas.push(`Literal de texto sin cerrar, abierto en la linea ${linea}`);
      break;
    }
    literales += 1;
    i = j + 1;
    continue;
  }

  i += 1;
}

// --- 3) RAISE con literal escapado ---
// PL/pgSQL parsea el mensaje de RAISE como literal simple, no como expresion,
// asi que un U&'...' ahi es error de sintaxis.
for (const m of sql.matchAll(/\braise\s+(notice|exception|warning|info|debug|log)\s+U&'/gi)) {
  problemas.push(
    `Linea ${lineaDe(m.index)}: RAISE con literal U&'...'. PL/pgSQL lo parsea ` +
      `como literal simple y da error de sintaxis. Debe ir sin acentos.`,
  );
}

// --- 4) CTE con columnas sin nombre ---
//
// Una expresion en el SELECT de una CTE —sum(...), 'literal'::text, count(*)—
// no tiene nombre propio. Si luego algo la referencia («select * from resto
// where total > 0»), Postgres falla con «column does not exist», y solo al
// ejecutarlo.
const CTE = /(\w+)\s+as\s*\(\s*select\s+([\s\S]*?)\bfrom\b/gi;

for (const m of sql.matchAll(CTE)) {
  const nombre = m[1];
  const listaColumnas = m[2];

  // Solo importa si algo referencia sus columnas por nombre mas adelante.
  const referencia = new RegExp(`from\\s+${nombre}\\b[\\s\\S]{0,160}?\\bwhere\\b`, 'i');
  if (!referencia.test(sql)) continue;

  // Partir por comas de primer nivel: las de dentro de parentesis no separan.
  const columnas = [];
  let profundidad = 0;
  let actual = '';

  for (const caracter of listaColumnas) {
    if (caracter === '(') profundidad += 1;
    if (caracter === ')') profundidad -= 1;
    if (caracter === ',' && profundidad === 0) {
      columnas.push(actual);
      actual = '';
      continue;
    }
    actual += caracter;
  }
  columnas.push(actual);

  for (const columna of columnas) {
    const limpia = columna.trim();
    if (!limpia) continue;

    const tieneAlias = /\s+as\s+\w+$/i.test(limpia);
    // Una referencia simple («t.monto») ya lleva nombre propio.
    const esIdentificador = /^[\w.]+$/.test(limpia);

    if (!tieneAlias && !esIdentificador) {
      const muestra = limpia.slice(0, 40).replace(/\s+/g, ' ');
      problemas.push(
        `Linea ~${lineaDe(m.index)}: la CTE "${nombre}" tiene una columna sin alias ` +
          `(${muestra}…) y algo referencia sus columnas por nombre.`,
      );
      break;
    }
  }
}

// --- 5) begin / commit emparejados ---
const begins = (sql.match(/^begin;/gm) ?? []).length;
const commits = (sql.match(/^commit;/gm) ?? []).length;
if (begins !== commits) {
  problemas.push(`${begins} begin frente a ${commits} commit`);
}

console.log(`Validando ${ruta}`);
console.log(`  ${sql.split('\n').length} lineas`);
console.log(`  ${dolares} bloques con comillas de dolar, todos cerrados`);
console.log(`  ${literales} literales de texto, todos cerrados`);
console.log(`  ${begins} transacciones begin/commit emparejadas`);
console.log(`  ${(sql.match(/U&'/g) ?? []).length} literales con acentos escapados`);

if (problemas.length) {
  console.error('\nPROBLEMAS:');
  problemas.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

console.log('\nSin problemas estructurales.');

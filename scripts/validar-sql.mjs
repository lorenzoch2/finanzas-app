/**
 * Comprobaciones estructurales del SQL generado, antes de dárselo a nadie.
 *
 * No sustituye a ejecutarlo, pero atrapa los fallos que ya nos costaron un
 * viaje: bloques con comillas de dólar sin cerrar, literales abiertos, y
 * caracteres fuera de ASCII que el portapapeles pueda romper.
 *
 *   node scripts/validar-sql.mjs supabase/APLICAR-PENDIENTES.sql
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2] ?? 'supabase/APLICAR-PENDIENTES.sql';
const sql = readFileSync(ruta, 'latin1');

const problemas = [];

// 1) Todo ASCII
const noAscii = [...sql].filter((c) => c.codePointAt(0) > 127);
if (noAscii.length) {
  problemas.push(`${noAscii.length} caracteres no ASCII: ${[...new Set(noAscii)].join(' ')}`);
}

// 2) Recorrido: literales, comentarios y bloques con comillas de dolar
let i = 0;
let dolares = 0;
let literales = 0;
let linea = 1;
const abiertos = [];

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
    abiertos.push({ marca, linea });
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

// 3) RAISE con literal escapado: PL/pgSQL no lo acepta
const raiseMalo = [...sql.matchAll(/\braise\s+(notice|exception|warning|info|debug|log)\s+U&'/gi)];
for (const m of raiseMalo) {
  const hasta = sql.slice(0, m.index).split('\n').length;
  problemas.push(
    `Linea ${hasta}: RAISE con literal U&'...'. PL/pgSQL parsea el mensaje de ` +
      `RAISE como literal simple y da error de sintaxis. Debe ir sin acentos.`,
  );
}

// 4) begin / commit emparejados
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

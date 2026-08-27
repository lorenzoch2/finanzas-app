/**
 * Convierte un archivo SQL a ASCII puro, sin perder significado.
 *
 * El problema que resuelve: al copiar el SQL al portapapeles desde Windows
 * PowerShell, `Get-Content` lee en ANSI y destroza el UTF-8. «Alimentación»
 * llega como «Alimentaci??n», y un literal así ya no coincide con el dato
 * guardado, con lo que la migración no encuentra nada y no avisa de nada.
 *
 * En vez de exigir una forma concreta de copiar —que es frágil y hay que
 * recordar— el archivo se vuelve inmune:
 *
 *   * Dentro de literales de texto, cada carácter no ASCII pasa a un escape
 *     Unicode de SQL estándar: 'Alimentación' -> U&'Alimentaci\00F3n'.
 *     El valor sigue siendo exactamente el mismo para Postgres.
 *
 *   * Fuera de literales (comentarios), las tildes se transliteran:
 *     «categorías» -> «categorias». Solo afecta a la lectura.
 *
 * Resultado: da igual cómo se copie el archivo, porque no tiene un solo byte
 * fuera del rango ASCII.
 */

const TRANSLITERACION = {
  á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
  Á: 'A', À: 'A', Ä: 'A', Â: 'A', Ã: 'A',
  É: 'E', È: 'E', Ë: 'E', Ê: 'E',
  Í: 'I', Ì: 'I', Ï: 'I', Î: 'I',
  Ó: 'O', Ò: 'O', Ö: 'O', Ô: 'O', Õ: 'O',
  Ú: 'U', Ù: 'U', Ü: 'U', Û: 'U',
  Ñ: 'N', Ç: 'C',
  '¿': '', '¡': '', '«': '"', '»': '"',
  '—': '-', '–': '-', '·': '-', '…': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'",
  '→': '->', '✓': 'ok', '›': '>',
};

const transliterar = (texto) =>
  [...texto]
    .map((c) => {
      if (c.codePointAt(0) < 128) return c;
      return TRANSLITERACION[c] ?? '?';
    })
    .join('');

/** 'Alimentación' -> U&'Alimentaci\00F3n'. Solo si hace falta. */
const literalAEscape = (contenido) => {
  if ([...contenido].every((c) => c.codePointAt(0) < 128)) {
    return `'${contenido}'`;
  }

  const escapado = [...contenido]
    .map((c) => {
      const punto = c.codePointAt(0);
      if (punto < 128) {
        // La barra invertida es el carácter de escape de U&'': hay que doblarla.
        return c === '\\' ? '\\\\' : c;
      }
      if (punto <= 0xffff) return '\\' + punto.toString(16).toUpperCase().padStart(4, '0');
      return '\\+' + punto.toString(16).toUpperCase().padStart(6, '0');
    })
    .join('');

  return `U&'${escapado}'`;
};

/**
 * Recorre el SQL distinguiendo literales, comentarios y bloques con comillas
 * de dólar. Hace falta ese cuidado porque una apóstrofe dentro de un
 * comentario no abre un literal, y un literal dentro del cuerpo de una
 * función sí debe escaparse.
 */
export function aAscii(sql) {
  let salida = '';
  let i = 0;

  while (i < sql.length) {
    const resto = sql.slice(i);

    // Comentario de línea
    if (resto.startsWith('--')) {
      const fin = sql.indexOf('\n', i);
      const trozo = fin === -1 ? sql.slice(i) : sql.slice(i, fin);
      salida += transliterar(trozo);
      i += trozo.length;
      continue;
    }

    // Comentario de bloque
    if (resto.startsWith('/*')) {
      const fin = sql.indexOf('*/', i + 2);
      const trozo = fin === -1 ? sql.slice(i) : sql.slice(i, fin + 2);
      salida += transliterar(trozo);
      i += trozo.length;
      continue;
    }

    // Bloque con comillas de dólar: $$ ... $$ o $tag$ ... $tag$
    const dolar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(resto);
    if (dolar) {
      const marca = dolar[0];
      const fin = sql.indexOf(marca, i + marca.length);
      if (fin !== -1) {
        const cuerpo = sql.slice(i + marca.length, fin);
        // El cuerpo es SQL: se procesa igual, para escapar sus literales.
        salida += marca + aAscii(cuerpo) + marca;
        i = fin + marca.length;
        continue;
      }
    }

    // Literal de texto, con '' como comilla escapada
    if (resto.startsWith("'")) {
      let j = i + 1;
      let contenido = '';
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          contenido += "''";
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        contenido += sql[j];
        j += 1;
      }
      salida += literalAEscape(contenido);
      i = j + 1;
      continue;
    }

    salida += transliterar(sql[i]);
    i += 1;
  }

  return salida;
}

// Uso como herramienta: node scripts/sql-ascii.mjs entrada.sql salida.sql
if (process.argv[1]?.endsWith('sql-ascii.mjs')) {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const [entrada, salida] = process.argv.slice(2);

  if (!entrada || !salida) {
    console.error('Uso: node scripts/sql-ascii.mjs <entrada.sql> <salida.sql>');
    process.exit(1);
  }

  const original = readFileSync(entrada, 'utf8');
  const convertido = aAscii(original);

  const noAscii = [...convertido].filter((c) => c.codePointAt(0) > 127);
  if (noAscii.length) {
    console.error(`Quedaron ${noAscii.length} caracteres no ASCII: ${[...new Set(noAscii)].join(' ')}`);
    process.exit(1);
  }

  writeFileSync(salida, convertido, 'ascii');
  console.log(`${entrada} -> ${salida}`);
  console.log(`  ${convertido.length} caracteres, todos ASCII`);
}

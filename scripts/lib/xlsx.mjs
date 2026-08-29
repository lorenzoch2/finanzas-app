/**
 * Lector minimo de xlsx: sin dependencias, valores calculados (no formulas).
 *
 * Google Sheets exporta en <v> el valor cacheado de cada formula, que es justo
 * lo que queremos: el resultado, no el ARRAYFORMULA que lo produjo.
 */
import { readFileSync } from 'node:fs';

const dir = process.env.XLSX_DIR;
const leer = (p) => readFileSync(`${dir}/${p}`, 'utf8');

const desescapar = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
   .replace(/&amp;/g, '&');

// --- cadenas compartidas ---
const compartidas = [];
for (const si of leer('xl/sharedStrings.xml').split('<si>').slice(1)) {
  const trozo = si.split('</si>')[0];
  let texto = '';
  for (const m of trozo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) texto += m[1];
  compartidas.push(desescapar(texto));
}

// --- que estilos representan fechas ---
const FECHA_BUILTIN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const estiloEsFecha = [];
{
  const xml = leer('xl/styles.xml');
  const custom = new Map();
  for (const m of xml.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)) {
    const codigo = m[2].replace(/\[[^\]]*\]/g, '').replace(/"[^"]*"/g, '');
    custom.set(+m[1], /[dy]/i.test(codigo));
  }
  const bloque = xml.split('<cellXfs')[1]?.split('</cellXfs>')[0] ?? '';
  for (const m of bloque.matchAll(/<xf\b[^>]*numFmtId="(\d+)"[^>]*>/g)) {
    const id = +m[1];
    estiloEsFecha.push(custom.has(id) ? custom.get(id) : FECHA_BUILTIN.has(id));
  }
}

/** Serial de Excel -> AAAA-MM-DD. Epoca 1899-12-30, con el bug del ano 1900. */
const aFecha = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);

const col = (ref) => {
  let n = 0;
  for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

/**
 * Las celdas vacias con formato vienen auto-cerradas: <c r="I2" s="5"/>.
 * Distinguirlas no es un detalle: con un solo patron perezoso, una celda
 * auto-cerrada se traga el contenido de la siguiente y TODAS las columnas de
 * esa fila quedan corridas una posicion.
 */
const CELDA = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;

export function hoja(archivo) {
  const xml = leer(`xl/worksheets/${archivo}`);
  const filas = [];
  for (const mf of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const celdas = [];
    for (const mc of mf[2].matchAll(CELDA)) {
      const attrs = mc[1] ?? mc[2];
      const cuerpo = mc[3] ?? '';
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!ref) continue;
      const tipo = /t="([^"]*)"/.exec(attrs)?.[1];
      const estilo = +(/s="(\d+)"/.exec(attrs)?.[1] ?? -1);
      let v;
      if (tipo === 'inlineStr') {
        v = [...cuerpo.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('');
      } else {
        const bruto = /<v>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
        if (bruto === undefined) continue;
        if (tipo === 's') v = compartidas[+bruto];
        else if (tipo === 'str') v = desescapar(bruto);   // formula que da texto
        else if (tipo === 'b') v = bruto === '1';
        else if (tipo === 'e') v = null;                  // #REF!, #N/A...
        else {
          const num = Number(bruto);
          v = estiloEsFecha[estilo] && num > 1000 ? aFecha(num) : num;
        }
      }
      if (typeof v === 'string') v = desescapar(v).trim();
      celdas[col(ref)] = v;
    }
    filas[+mf[1] - 1] = celdas;
  }
  return filas;
}

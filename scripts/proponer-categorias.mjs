/**
 * Muestra la taxonomía propuesta y comprueba que cubre TODOS tus ítems.
 *
 * Es la revisión previa a la migración 0010: si algo queda sin mapear, sale
 * listado aquí en vez de acabar en una categoría equivocada sin que nadie se
 * entere.
 *
 *   node scripts/proponer-categorias.mjs [dir-backup]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AMBIGUOS, PADRE_DE, TAXONOMIA, subcategoriaDe } from './taxonomia.mjs';

const dir = process.argv[2] ?? join('backups', readFileSync('backups/ULTIMO.txt', 'utf8').trim());
const items = JSON.parse(readFileSync(join(dir, 'items_detalle.json'), 'utf8')).filter(
  (i) => i.nombre_producto !== 'Gasto sin detalle',
);

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
    .format(n);

// --- La taxonomía ---
console.log('TAXONOMÍA PROPUESTA\n');
let nPadres = 0;
let nHijas = 0;
for (const [padre, hijas] of Object.entries(TAXONOMIA)) {
  nPadres += 1;
  nHijas += hijas.length;
  console.log(`  ${padre}`);
  console.log(`    ${hijas.join(' · ')}`);
}
console.log(`\n  ${nPadres} categorías principales, ${nHijas} subcategorías.`);

// --- Cobertura ---
const total = (i) => Number(i.precio_final || 0) * Number(i.unidades || 1);
const porSub = new Map();
const sinMapear = new Map();

for (const item of items) {
  const sub = subcategoriaDe(item.nombre_producto);
  if (!sub) {
    const clave = item.nombre_producto ?? '(sin nombre)';
    sinMapear.set(clave, (sinMapear.get(clave) ?? 0) + total(item));
    continue;
  }
  if (!porSub.has(sub)) porSub.set(sub, { n: 0, monto: 0, productos: new Set() });
  const acc = porSub.get(sub);
  acc.n += 1;
  acc.monto += total(item);
  acc.productos.add(item.nombre_producto);
}

console.log('\n\nA DÓNDE VA CADA COSA\n');
for (const [padre, hijas] of Object.entries(TAXONOMIA)) {
  const conDatos = hijas.filter((h) => porSub.has(h));
  if (!conDatos.length) continue;

  const montoPadre = conDatos.reduce((s, h) => s + porSub.get(h).monto, 0);
  console.log(`  ${padre}  —  ${fmt(montoPadre)}`);

  for (const hija of conDatos) {
    const { n, monto, productos } = porSub.get(hija);
    console.log(`    ${hija.padEnd(24)} ${String(n).padStart(3)} ítems  ${fmt(monto).padStart(12)}`);
    console.log(`      ${[...productos].join(', ')}`);
  }
  console.log('');
}

// --- Lo que queda fuera ---
const vacias = Object.entries(TAXONOMIA)
  .flatMap(([, hijas]) => hijas)
  .filter((h) => !porSub.has(h));

console.log(`SUBCATEGORÍAS SIN USO HISTÓRICO (${vacias.length})`);
console.log(`  ${vacias.join(' · ')}`);
console.log('  Se crean igual: son para lo que viene, no para lo que hubo.\n');

const cubiertos = items.length - [...sinMapear.values()].length;
console.log('COBERTURA');
console.log(`  ${cubiertos} de ${items.length} ítems mapeados`);

if (sinMapear.size) {
  console.log(`\n  SIN MAPEAR (${sinMapear.size}):`);
  for (const [nombre, monto] of [...sinMapear].sort((a, b) => b[1] - a[1])) {
    const razon = AMBIGUOS[nombre];
    console.log(`    ${nombre.padEnd(22)} ${fmt(monto).padStart(12)}${razon ? '   ' + razon : ''}`);
  }
  console.log('\n  Estos NO se migran a ciegas: quedan sin categoría hasta que decidas.');
}

// Comparación con lo de hoy
const sinCategoriaAntes = 27;
console.log(`\nANTES: ${sinCategoriaAntes} ítems sin categoría de ${items.length} (${Math.round((sinCategoriaAntes / items.length) * 100)}%)`);
console.log(`AHORA: ${sinMapear.size ? [...sinMapear.values()].length : 0} sin clasificar`);

// Sanidad de la taxonomía
const huerfanas = [...porSub.keys()].filter((s) => !PADRE_DE.has(s));
if (huerfanas.length) {
  console.error(`\nERROR: subcategorías sin padre: ${huerfanas.join(', ')}`);
  process.exit(1);
}

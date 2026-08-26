/**
 * Captura los saldos que calcula la implementación LEGACY (src/hooks/useFuentes.js)
 * a partir de un backup local, y los congela como "golden".
 *
 * Es la red de seguridad de la migración: la v2 debe reproducir estos números
 * dígito a dígito. Si no lo hace, la migración está mal.
 *
 * La salida contiene saldos reales -> se escribe en backups/ (ignorado por git).
 *
 *   node scripts/capture-legacy-balances.mjs <dir-backup>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Uso: node scripts/capture-legacy-balances.mjs <dir-backup>');
  process.exit(1);
}

const load = (name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));

const fuentes = load('fuentes_cuentas');
const transacciones = load('transacciones');
const ajustes = load('ajustes_saldos');

// --- Réplica EXACTA de computeBalance en src/hooks/useFuentes.js:19-45 ---
// No se corrige nada aquí a propósito: el objetivo es capturar el comportamiento
// actual, bugs de zona horaria incluidos.
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const computeBalance = (sourceId, monthDate) => {
  const monthStart = startOfMonth(monthDate);

  const sourceAdjustments = ajustes
    .filter((adjustment) => adjustment.fuente_id === sourceId)
    .sort((a, b) => new Date(a.fecha_referencia) - new Date(b.fecha_referencia));

  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
  const lastAdjustment = sourceAdjustments
    .filter((adjustment) => adjustment.fecha_referencia < nextMonthKey)
    .at(-1);

  const saldoInicial = lastAdjustment ? Number(lastAdjustment.monto_ajustado || 0) : 0;
  const baseDate = lastAdjustment
    ? new Date(`${lastAdjustment.fecha_referencia}T00:00:00`)
    : new Date(2020, 0, 1);

  const relevantTransactions = transacciones.filter((transaction) => {
    if (transaction.fuente_id !== sourceId) return false;
    const transactionDate = new Date(transaction.fecha);
    return (
      transactionDate >= baseDate &&
      transactionDate < new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    );
  });

  let saldoActual = saldoInicial;
  for (const transaction of relevantTransactions) {
    const amount = Number(transaction.monto || 0);
    saldoActual += transaction.tipo === 'ingreso' ? amount : -amount;
  }

  return { saldoInicial, saldoActual };
};

// Gastos del mes, tal como los calcula useFuentes.js:100-103
const monthExpenses = (monthDate) =>
  transacciones
    .filter(
      (t) =>
        t.tipo === 'egreso' &&
        new Date(t.fecha).getMonth() === monthDate.getMonth() &&
        new Date(t.fecha).getFullYear() === monthDate.getFullYear(),
    )
    .reduce((sum, t) => sum + Number(t.monto || 0), 0);

// Rango: desde el mes de la transacción más antigua hasta el mes actual.
const fechas = transacciones.map((t) => new Date(t.fecha)).sort((a, b) => a - b);
const primera = fechas[0] ?? new Date();
const hoy = new Date();

const meses = [];
const cursor = new Date(primera.getFullYear(), primera.getMonth(), 1);
while (cursor <= hoy) {
  meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
  cursor.setMonth(cursor.getMonth() + 1);
}

const golden = {
  capturadoEn: new Date().toISOString(),
  origen: dir,
  zonaHorariaDelProceso: Intl.DateTimeFormat().resolvedOptions().timeZone,
  advertencia:
    'La implementación legacy usa constructores Date en hora local, por lo que estos números dependen de la TZ del proceso.',
  conteos: {
    fuentes: fuentes.length,
    transacciones: transacciones.length,
    ajustes: ajustes.length,
  },
  meses: meses.map((monthKey) => {
    const monthDate = new Date(`${monthKey}-01T00:00:00`);
    const porFuente = fuentes.map((f) => {
      const { saldoInicial, saldoActual } = computeBalance(f.id, monthDate);
      return { fuente_id: f.id, nombre: f.nombre, saldoInicial, saldoActual };
    });
    return {
      mes: monthKey,
      porFuente,
      totalDisponible: porFuente.reduce((s, f) => s + Number(f.saldoActual || 0), 0),
      gastosDelMes: monthExpenses(monthDate),
    };
  }),
};

const out = join(dir, 'golden-saldos.json');
writeFileSync(out, JSON.stringify(golden, null, 2));

console.log(`TZ del proceso: ${golden.zonaHorariaDelProceso}`);
console.log(`Meses capturados: ${meses.length}  (${meses[0]} -> ${meses.at(-1)})`);
console.log(`Fuentes: ${fuentes.length}`);
console.log(`Golden escrito en: ${out}`);

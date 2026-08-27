/**
 * Respalda todas tus tablas a backups/<fecha>/.
 *
 * Desde que RLS está activo (migración 0002), la anon key sola no lee nada:
 * devuelve 401. Por eso este script inicia sesión, a diferencia del respaldo
 * original de la v2, que se apoyaba en que la base estaba abierta.
 *
 * Las credenciales van por variables de entorno, no por argumentos: así no
 * quedan en el historial del shell.
 *
 *   $env:FINANZAPP_EMAIL='tu@correo.cl'; $env:FINANZAPP_PASSWORD='...'
 *   node scripts/backup.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const TABLAS = [
  'fuentes_cuentas',
  'transacciones',
  'items_detalle',
  'ajustes_saldos',
  'categorias',
  // Las de la v3. Se respaldan si existen; si no, se anota y se sigue.
  'productos',
  'establecimientos',
  'presupuestos',
];

const leerEnv = () => {
  const valores = {};
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const igual = linea.indexOf('=');
    if (igual > 0 && !linea.trimStart().startsWith('#')) {
      valores[linea.slice(0, igual).trim()] = linea.slice(igual + 1).trim();
    }
  }
  return valores;
};

const env = leerEnv();
const email = process.env.FINANZAPP_EMAIL;
const password = process.env.FINANZAPP_PASSWORD;

if (!email || !password) {
  console.error('Faltan FINANZAPP_EMAIL y FINANZAPP_PASSWORD en el entorno.');
  console.error('Con RLS activo, sin sesión las tablas devuelven 0 filas.');
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const marca = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace('T', '-')
  .slice(0, 15);

const main = async () => {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('No se pudo iniciar sesión:', error.message);
    process.exit(1);
  }

  const dir = join('backups', marca);
  mkdirSync(dir, { recursive: true });

  let total = 0;

  for (const tabla of TABLAS) {
    const { data, error: fallo } = await supabase.from(tabla).select('*');

    if (fallo) {
      // Una tabla que todavía no existe no es un fallo del respaldo.
      const noExiste = /does not exist|schema cache/i.test(fallo.message);
      console.log(`  ${tabla.padEnd(20)} ${noExiste ? '(no existe todavía)' : 'ERROR: ' + fallo.message}`);
      continue;
    }

    writeFileSync(join(dir, `${tabla}.json`), JSON.stringify(data ?? [], null, 2));
    total += (data ?? []).length;
    console.log(`  ${tabla.padEnd(20)} ${String((data ?? []).length).padStart(4)} filas`);
  }

  await supabase.auth.signOut();

  writeFileSync('backups/ULTIMO.txt', marca);
  console.log(`\n${total} filas respaldadas en ${dir}`);

  if (total === 0) {
    console.error('\nCERO filas. Algo va mal: revisa la sesión antes de migrar nada.');
    process.exit(1);
  }
};

main().catch((error) => {
  console.error('Fallo inesperado:', error?.message ?? error);
  process.exit(1);
});

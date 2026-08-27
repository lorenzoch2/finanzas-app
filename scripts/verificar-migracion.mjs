/**
 * Compara los saldos que calcula la base DESPUÉS de migrar contra el golden
 * capturado ANTES, con la lógica antigua.
 *
 * Es la prueba de que la migración no movió ningún número tuyo. Si algo no
 * cuadra, sale con código 1 y dice exactamente qué mes y qué fuente.
 *
 * Uso (las credenciales van por variables de entorno; el script nunca las
 * imprime ni las guarda):
 *
 *   FINANZAPP_EMAIL=tu@correo.cl FINANZAPP_PASSWORD='...' \
 *     node scripts/verificar-migracion.mjs backups/<stamp>
 *
 * En PowerShell:
 *   $env:FINANZAPP_EMAIL='tu@correo.cl'; $env:FINANZAPP_PASSWORD='...'
 *   node scripts/verificar-migracion.mjs backups/<stamp>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const dir = process.argv[2];
if (!dir) {
  console.error('Uso: node scripts/verificar-migracion.mjs <dir-backup>');
  process.exit(1);
}

const leerEnv = () => {
  const texto = readFileSync('.env.local', 'utf8');
  const valores = {};
  for (const linea of texto.split(/\r?\n/)) {
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
  console.error('Se necesitan porque, con RLS activo, los saldos solo se ven con sesión iniciada.');
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const golden = JSON.parse(readFileSync(join(dir, 'golden-saldos.json'), 'utf8'));
const zona = golden.zonaHorariaDelProceso ?? 'America/Santiago';

const fmt = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);

// Los saldos históricos traen decimales por los descuentos porcentuales.
// Medio peso de tolerancia distingue un redondeo de un error real.
const TOLERANCIA = 0.5;

const main = async () => {
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email, password });
  if (errorLogin) {
    console.error('No se pudo iniciar sesión:', errorLogin.message);
    process.exit(1);
  }

  console.log(`Golden: ${golden.meses.length} meses, zona ${zona}\n`);

  let fallos = 0;
  let comparaciones = 0;

  for (const mes of golden.meses) {
    const { data, error } = await supabase.rpc('saldos_por_fuente', {
      p_mes: `${mes.mes}-01`,
      p_tz: zona,
    });

    if (error) {
      console.error(`  ${mes.mes}  ERROR al llamar saldos_por_fuente: ${error.message}`);
      fallos += 1;
      continue;
    }

    const porId = new Map((data ?? []).map((fila) => [fila.fuente_id, fila]));
    let okDelMes = true;

    for (const esperado of mes.porFuente) {
      comparaciones += 1;
      const obtenido = porId.get(esperado.fuente_id);

      if (!obtenido) {
        console.error(`  ${mes.mes}  FALTA la fuente "${esperado.nombre}" en el resultado`);
        fallos += 1;
        okDelMes = false;
        continue;
      }

      const diferencia = Math.abs(Number(obtenido.saldo_actual) - Number(esperado.saldoActual));
      if (diferencia > TOLERANCIA) {
        console.error(
          `  ${mes.mes}  ${esperado.nombre}: antes ${fmt(esperado.saldoActual)}, ` +
            `ahora ${fmt(obtenido.saldo_actual)}  (difiere ${fmt(diferencia)})`,
        );
        fallos += 1;
        okDelMes = false;
      }
    }

    // El resumen mensual también debe cuadrar con lo que calculaba la app vieja.
    const { data: resumen, error: errorResumen } = await supabase.rpc('resumen_mensual', {
      p_mes: `${mes.mes}-01`,
      p_tz: zona,
    });

    if (errorResumen) {
      console.error(`  ${mes.mes}  ERROR al llamar resumen_mensual: ${errorResumen.message}`);
      fallos += 1;
    } else {
      comparaciones += 1;
      const gastos = Number(resumen?.[0]?.gastos ?? 0);
      if (Math.abs(gastos - Number(mes.gastosDelMes)) > TOLERANCIA) {
        console.error(
          `  ${mes.mes}  gastos del mes: antes ${fmt(mes.gastosDelMes)}, ahora ${fmt(gastos)}`,
        );
        fallos += 1;
        okDelMes = false;
      }
    }

    if (okDelMes) console.log(`  ${mes.mes}  ok`);
  }

  await supabase.auth.signOut();

  console.log(`\n${comparaciones} comparaciones, ${fallos} discrepancias.`);

  if (fallos > 0) {
    console.error('\nLA MIGRACIÓN CAMBIÓ TUS NÚMEROS. No sigas: revisa antes de confiar en estos datos.');
    process.exit(1);
  }

  console.log('Los saldos son idénticos a los de antes de migrar.');
};

main().catch((error) => {
  console.error('Fallo inesperado:', error?.message ?? error);
  process.exit(1);
});

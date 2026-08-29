/**
 * Convierte el histórico del Google Sheet a SQL para Finanzapp.
 *
 *   XLSX_DIR=privado/xlsx node scripts/importar-historico.mjs
 *
 * Entra: el .xlsx descomprimido del Sheet «Finanzas» (hojas Control mensual,
 * Salidas y Entradas). Sale: privado/0021_historico.sql, que NO se versiona
 * porque lleva 422 gastos reales con fecha e importe.
 *
 * Lo que hace, y por qué:
 *
 *  1. CORTA EN JUNIO 2026. Las 6 filas del Sheet de junio ya están en la app
 *     (piscola, giro, gatorade, pollo asado, préstamo papá). Importarlas otra
 *     vez duplicaría el gasto de ese mes.
 *
 *  2. TRAE EL SUELDO. No está en la hoja Entradas: vive solo como número en
 *     el Control mensual, y es el 80% de todo lo que entró. Sin él, el margen
 *     sale negativo por la misma razón que ya arreglamos una vez: hay dinero
 *     que entra y el libro no lo ve.
 *
 *  3. DISTINGUE TRASPASO DE GASTO. «transferencia cuenta rut» aparece en las
 *     dos hojas a la vez: como salida de Santander y como entrada a la Cuenta
 *     RUT. Contarlo dos veces infla gasto e ingreso el mismo día. Se emparejan
 *     y quedan como una sola transferencia. Igual el ahorro mensual: mover
 *     plata a un lado no es gastarla.
 *
 *  4. DISTINGUE COMPRA DE PRODUCTO. Una fila «Santa Isabel» no es un producto
 *     llamado Santa Isabel: es una compra sin desglose. Va con
 *     `monto_sin_detalle`, que dice la verdad —hubo gasto, no sabemos en qué—
 *     en vez de inventar un producto fantasma que ensucie el catálogo.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hoja } from './lib/xlsx.mjs';
import { aAscii } from './sql-ascii.mjs';
import {
  SUBCATEGORIAS_NUEVAS,
  clasificar,
  esCanasta,
  establecimientoDe,
  fraccionDeFechaFalsa,
  normalizar,
} from './mapeo-historico.mjs';

/** Desde aquí manda la app: lo del Sheet ya está dentro. */
const CORTE = '2026-06-01';

/**
 * El sueldo lleva su propio corte, y va un mes más lejos.
 *
 * El corte general existe para no duplicar los 6 gastos de junio que la app ya
 * tenía. Pero el sueldo nunca estuvo en la app —ni en junio ni en ningún mes—,
 * así que no hay nada que duplicar. Aplicarle el mismo corte dejaba fuera el
 * sueldo de junio de 2026 y hacía que ese mes saliera en rojo por una omisión
 * mía, no por lo que pasó.
 */
const CORTE_SUELDO = '2026-07-01';
const ZONA = 'America/Santiago';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// --------------------------------------------------------------- utilidades

/**
 * UUID estable a partir del contenido de la fila.
 *
 * Determinista a propósito: volver a generar el archivo da los mismos ids, así
 * que reaplicarlo no duplica nada. Es la diferencia entre una importación que
 * se puede repetir sin miedo y una que hay que acertar a la primera.
 */
const idDe = (...partes) => {
  const h = createHash('sha1').update(partes.join('|')).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), '4' + h.slice(13, 16),
          ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
          h.slice(20, 32)].join('-');
};

const txt = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v == null || !Number.isFinite(Number(v)) ? 'null' : String(Number(v)));
const bool = (v) => (v ? 'true' : 'false');
const clp = (n) => '$' + Math.round(n).toLocaleString('es-CL');
const mesDe = (f) => String(f).slice(0, 7);

// ------------------------------------------------------------------- lectura

const control = hoja('sheet1.xml');
const salidas = hoja('sheet2.xml').slice(1).filter((r) => r?.[0] && String(r[9]) < CORTE);
const entradas = hoja('sheet3.xml').slice(1).filter((r) => r?.[0] && String(r[3]) < CORTE);

const movimientos = [];   // filas de transacciones
const productos = new Map();
const establecimientos = new Map();
const avisos = [];

// ------------------------------------------------------- traspasos entre cuentas

/**
 * Empareja cada «transferencia cuenta rut» de Salidas con su gemela de
 * Entradas: mismo importe, hasta una semana de diferencia. La que no encuentra
 * pareja se queda como lo que parezca ser, no se fuerza.
 */
// «tranferencia», sin la s, esta escrito asi en el Sheet. Un traspaso mal
// detectado se cuenta dos veces: como gasto y como ingreso el mismo dia.
const esTraspaso = (n) => /tran?s?ferencia|traspaso/.test(normalizar(n));
const entradasUsadas = new Set();
const traspasos = [];

for (const s of salidas.filter((r) => esTraspaso(r[0]))) {
  const monto = Number(s[8]) || 0;
  const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
  const pareja = entradas.findIndex(
    (e, i) => !entradasUsadas.has(i) && esTraspaso(e[0]) && (Number(e[1]) || 0) === monto && dias(s[9], e[3]) <= 7,
  );
  if (pareja < 0) {
    avisos.push(`Traspaso sin pareja: ${s[9]} ${s[0]} ${clp(monto)} (queda como gasto)`);
    continue;
  }
  entradasUsadas.add(pareja);
  traspasos.push(s);
  movimientos.push({
    id: idDe('traspaso', s[9], monto), tipo: 'transferencia', fecha: s[9], monto,
    fuente: 'santander', destino: 'rut', nota: 'Traspaso a la Cuenta RUT',
  });
}
const filasTraspaso = new Set(traspasos);

// --------------------------------------------------------------- ahorro mensual

// Lorenzo confirmó que era plata apartada, no gastada. Se modela como traspaso
// a una cuenta «Ahorro»: mover dinero no es consumirlo, y así la tasa de
// ahorro futura no lo cuenta como gasto.
const filasAhorro = new Set(salidas.filter((r) => r[5] === 'Ahorro'));
for (const r of filasAhorro) {
  const monto = Number(r[8]) || 0;
  movimientos.push({
    id: idDe('ahorro', r[9], monto), tipo: 'transferencia', fecha: r[9], monto,
    fuente: 'santander', destino: 'ahorro', nota: 'Ahorro del mes',
  });
}

// -------------------------------------------------------------------- gastos

let conRegla = 0;
let canastas = 0;

for (const r of salidas) {
  if (filasTraspaso.has(r) || filasAhorro.has(r)) continue;

  const nombre = String(r[0]).trim();
  const total = Number(r[8]) || 0;
  const descuento = Number(r[7]) || 0;
  const fecha = String(r[9]);
  const fuente = r[4] === 'Cuenta Rut' ? 'rut' : 'santander';
  const { sub, via } = clasificar(nombre, r[5]);
  if (via === 'regla') conRegla += 1;

  const est = establecimientoDe(nombre);
  if (est) establecimientos.set(normalizar(est.nombre), est);

  const canasta = esCanasta(nombre);
  if (canasta) canastas += 1;

  // Unidades: solo si es un número sensato. Google metió una fecha en una.
  const u = typeof r[1] === 'number' && r[1] >= 1 ? Math.round(r[1]) : 1;

  // Kg: número, o la fracción que Google convirtió en fecha («2/4» de carne).
  const kg = typeof r[2] === 'number' ? r[2] : fraccionDeFechaFalsa(r[2]);

  const id = idDe('gasto', fecha, nombre, total, fuente);
  const mov = {
    id, tipo: 'egreso', fecha, monto: total, fuente, destino: null,
    nota: nombre, establecimiento: est?.nombre ?? null, sinDetalle: canasta,
  };

  if (!canasta) {
    // `Valor` del Sheet es el total de la línea, no el precio unitario: una
    // bandeja de treinta huevos trae el precio de la bandeja entera. El precio
    // por unidad se deriva, que es lo que hace falta para seguir un precio en
    // el tiempo.
    mov.producto = nombre;
    mov.subcategoria = sub;
    mov.unidades = u;
    mov.cantidadMedida = kg;
    mov.descuentoUnitario = Math.round((descuento / u) * 100) / 100;
    mov.precioUnitario = Math.round(((total + descuento) / u) * 100) / 100;

    const clave = normalizar(nombre);
    const previo = productos.get(clave);
    productos.set(clave, {
      nombre, subcategoria: sub, vendidoPor: kg != null || previo?.vendidoPor === 'peso' ? 'peso' : 'unidad',
    });
  }
  movimientos.push(mov);
}

// ------------------------------------------------------------------ ingresos

/**
 * Aperturas: el punto desde el que se empieza a contar.
 *
 * Sin esto los saldos arrancarían en cero y ninguno cuadraría con la columna
 * «Cta Cor Sant» del Control mensual. Con esto sí cuadran los siete meses, que
 * es la identidad que la propia planilla usa: residuo + sueldo + entradas -
 * salidas = saldo de cierre. El informe del final lo comprueba mes a mes.
 *
 * Van como `apertura` y no como ingreso a propósito: es plata que ya estaba,
 * no plata que entró ese mes. Es la distinción que la 0019 hizo posible.
 */
const ajustes = [];
{
  const primera = control.slice(1).find((f) => Number.isFinite(Number(f?.[2])) && Number(f[2]) > 0);
  if (primera) {
    const m = MESES.indexOf(String(primera[1]));
    const fecha = `${primera[0]}-${String(m + 1).padStart(2, '0')}-01`;
    ajustes.push({
      id: idDe('apertura', 'santander', fecha), fuente: 'santander', fecha,
      monto: Number(primera[2]), nota: 'Saldo con el que arranca el historico',
    });
  }
}

for (const [i, e] of entradas.entries()) {
  if (entradasUsadas.has(i)) continue;
  const monto = Number(e[1]) || 0;
  const nombre = String(e[0]).trim();
  const fuente = e[2] === 'Cuenta Rut' ? 'rut' : 'santander';

  // «Cuenta Rut inicial» lo dice en el nombre: es el saldo de partida de esa
  // cuenta, no dinero que entró. Tu propio Control ya lo dejaba fuera de las
  // entradas del mes; aquí pasa a ser lo que siempre fue.
  if (/inicial/.test(normalizar(nombre))) {
    ajustes.push({
      id: idDe('apertura', fuente, String(e[3])), fuente, fecha: String(e[3]),
      monto, nota: nombre,
    });
    continue;
  }

  movimientos.push({
    id: idDe('ingreso', e[3], nombre, monto), tipo: 'ingreso', fecha: String(e[3]),
    monto, fuente, destino: null, nota: nombre,
  });
}

/**
 * El sueldo, que solo existía en el Control mensual.
 *
 * Va el día 1 porque es lo que asume la propia planilla: «Entrada total =
 * Residuo + Sueldo + Entradas», es decir, disponible desde que empieza el mes.
 */
let sueldoTotal = 0;
for (const f of control.slice(1)) {
  if (!f?.[0] || !f?.[1]) continue;
  const m = MESES.indexOf(String(f[1]));
  const sueldo = Number(f[3]);
  if (m < 0 || !Number.isFinite(sueldo) || sueldo <= 0) continue;
  const fecha = `${f[0]}-${String(m + 1).padStart(2, '0')}-01`;
  if (fecha >= CORTE_SUELDO) continue;
  sueldoTotal += sueldo;
  movimientos.push({
    id: idDe('sueldo', fecha, sueldo), tipo: 'ingreso', fecha, monto: sueldo,
    fuente: 'santander', destino: null, nota: 'Sueldo',
  });
}

// ----------------------------------------------------------------------- SQL

const L = [];
const p = (s = '') => L.push(s);

p('-- =====================================================================');
p('-- FINANZAPP - HISTORICO 2025-2026 desde el Google Sheet');
p('--');
p('-- EJECUTALO ENTERO, DE UNA SOLA VEZ. No selecciones un trozo: los');
p('-- bloques "do $$ ... $$" son indivisibles.');
p('--');
p('-- Es ASCII puro: los acentos van escapados como U&\'...\\00F3...\', asi que');
p('-- da igual como se copie aunque el portapapeles rompa el UTF-8.');
p('--');
p('-- Es SEGURO reaplicarlo: cada fila lleva un id derivado de su contenido,');
p('-- asi que insertarla dos veces no la duplica.');
p('--');
p('-- ANTES: haz el respaldo.');
p('--   $env:FINANZAPP_EMAIL=\'tu@correo.cl\'');
p('--   $env:FINANZAPP_PASSWORD=\'tu contrasena\'');
p('--   node scripts/backup.mjs');
p('-- =====================================================================');
p();
p('begin;');
p();

// --- guardia de orden
p('-- --------------------------------------------- Primero 0019 y 0020');
p('-- Las dos tienen que estar aplicadas ANTES que esto, y no por capricho de');
p('-- numeracion:');
p('--');
p('--   0019  su relleno marca todo ajuste sin motivo como «entro plata y no');
p('--         la anote». Si se aplica DESPUES de cargar el historico, volveria');
p('--         a marcar mal los dos ajustes que este archivo corrige.');
p('--');
p('--   0020  sin ella una restriccion antigua rechaza cualquier transferencia,');
p('--         y aqui entran ocho: los ahorros mensuales y los traspasos a la');
p('--         Cuenta RUT.');
p('do $$');
p('begin');
p('  if not exists (');
p('    select 1 from information_schema.columns');
p("     where table_schema = 'public' and table_name = 'ajustes_saldos'");
p("       and column_name = 'motivo'");
p('  ) then');
p("    raise exception 'Falta la migracion 0019. Aplica supabase/APLICAR-PENDIENTES.sql primero.';");
p('  end if;');
p();
p('  if exists (');
p('    select 1');
p('      from pg_constraint con');
p('      join pg_class     c on c.oid = con.conrelid');
p('      join pg_namespace n on n.oid = c.relnamespace');
p("     where n.nspname = 'public' and c.relname = 'transacciones'");
p("       and con.contype = 'c'");
p("       and pg_get_constraintdef(con.oid) ~ 'tipo'");
p("       and pg_get_constraintdef(con.oid) !~ 'transferencia'");
p('  ) then');
p("    raise exception 'Falta la migracion 0020: una restriccion antigua todavia impide las transferencias.';");
p('  end if;');
p('end $$;');
p();

// --- subcategorías nuevas
p('-- ------------------------------------------- Subcategorias que faltaban');
for (const s of SUBCATEGORIAS_NUEVAS) p(`-- ${s.padre} > ${s.nombre}: ${s.porque}`);
p('do $$');
p('declare v_usuario uuid; v_padre uuid;');
p('begin');
p('  select id into v_usuario from auth.users limit 1;');
p("  if v_usuario is null then raise exception 'No hay usuario en auth.users.'; end if;");
for (const s of SUBCATEGORIAS_NUEVAS) {
  p();
  p(`  select id into v_padre from public.categorias`);
  p(`   where user_id = v_usuario and nombre = ${txt(s.padre)} and parent_id is null limit 1;`);
  p(`  if v_padre is null then raise exception 'Falta la categoria ${s.padre}. Aplica antes la 0011.'; end if;`);
  p(`  insert into public.categorias (nombre, parent_id, user_id)`);
  p(`  select ${txt(s.nombre)}, v_padre, v_usuario`);
  p(`   where not exists (select 1 from public.categorias`);
  p(`                      where user_id = v_usuario and parent_id = v_padre and nombre = ${txt(s.nombre)});`);
}
p('end $$;');
p();

// --- tablas temporales
p('-- --------------------------------------------------- Datos del historico');
p('create temporary table tmp_est (nombre text, tipo text) on commit drop;');
p('create temporary table tmp_prod (nombre text, subcategoria text, vendido_por text) on commit drop;');
p('create temporary table tmp_aj (id uuid, fuente text, fecha date, monto numeric, nota text) on commit drop;');
p('create temporary table tmp_mov (');
p('  id uuid, tipo text, fecha date, monto numeric, fuente text, destino text,');
p('  nota text, establecimiento text, sin_detalle boolean, producto text,');
p('  subcategoria text, unidades numeric, cantidad_medida numeric,');
p('  precio_unitario numeric, descuento_unitario numeric');
p(') on commit drop;');
p();

const bloque = (tabla, filas, cols) => {
  p(`insert into ${tabla} (${cols}) values`);
  filas.forEach((f, i) => p(`  (${f})${i === filas.length - 1 ? ';' : ','}`));
  p();
};

bloque('tmp_est', [...establecimientos.values()].map((e) => `${txt(e.nombre)}, ${txt(e.tipo)}`), 'nombre, tipo');
bloque('tmp_prod', [...productos.values()].map((x) => `${txt(x.nombre)}, ${txt(x.subcategoria)}, ${txt(x.vendidoPor)}`), 'nombre, subcategoria, vendido_por');
bloque('tmp_aj', ajustes.map((a) => `'${a.id}'::uuid, ${txt(a.fuente)}, ${txt(a.fecha)}, ${num(a.monto)}, ${txt(a.nota)}`), 'id, fuente, fecha, monto, nota');

movimientos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
bloque(
  'tmp_mov',
  movimientos.map((m) =>
    [`'${m.id}'::uuid`, txt(m.tipo), txt(m.fecha), num(m.monto), txt(m.fuente), txt(m.destino),
     txt(m.nota), txt(m.establecimiento), bool(m.sinDetalle), txt(m.producto),
     txt(m.subcategoria), num(m.unidades), num(m.cantidadMedida),
     num(m.precioUnitario), num(m.descuentoUnitario)].join(', '),
  ),
  'id, tipo, fecha, monto, fuente, destino, nota, establecimiento, sin_detalle, producto, subcategoria, unidades, cantidad_medida, precio_unitario, descuento_unitario',
);

// --- carga
p('-- ------------------------------------------------------------- La carga');
p('do $$');
p('declare');
p('  v_usuario uuid; v_sant uuid; v_rut uuid; v_ahorro uuid;');
p('  v_est int; v_prod int; v_tx int; v_items int; v_sin_cat int;');
p('begin');
p('  select id into v_usuario from auth.users limit 1;');
p();
p('  select id into v_sant from public.fuentes_cuentas');
p("   where user_id = v_usuario and public.normalizar_texto(nombre) like '%santander%' limit 1;");
p('  select id into v_rut from public.fuentes_cuentas');
p("   where user_id = v_usuario and public.normalizar_texto(nombre) like '%rut%' limit 1;");
p("  if v_sant is null or v_rut is null then");
p("    raise exception 'No encuentro las cuentas Santander y RUT.';");
p('  end if;');
p();
p('  -- La cuenta de ahorro: plata apartada, no gastada.');
p('  insert into public.fuentes_cuentas (nombre, tipo, user_id)');
p("  select 'Ahorro', 'inversion', v_usuario");
p('   where not exists (select 1 from public.fuentes_cuentas');
p("                      where user_id = v_usuario and public.normalizar_texto(nombre) = 'ahorro');");
p('  select id into v_ahorro from public.fuentes_cuentas');
p("   where user_id = v_usuario and public.normalizar_texto(nombre) = 'ahorro' limit 1;");
p();
p('  insert into public.establecimientos (nombre, tipo, user_id)');
p('  select t.nombre, t.tipo, v_usuario from tmp_est t');
p('  on conflict do nothing;');
p('  get diagnostics v_est = row_count;');
p();
p('  insert into public.productos (nombre, categoria_id, vendido_por, user_id)');
p('  select t.nombre,');
p('         (select c.id from public.categorias c');
p('           where c.user_id = v_usuario and c.nombre = t.subcategoria');
p('             and c.parent_id is not null limit 1),');
p('         t.vendido_por, v_usuario');
p('    from tmp_prod t');
p('  on conflict do nothing;');
p('  get diagnostics v_prod = row_count;');
p();
p('  select count(*) into v_sin_cat from tmp_prod t');
p('   where not exists (select 1 from public.categorias c');
p('                      where c.user_id = v_usuario and c.nombre = t.subcategoria');
p('                        and c.parent_id is not null);');
p('  if v_sin_cat > 0 then');
p("    raise exception '% productos apuntan a una subcategoria que no existe.', v_sin_cat;");
p('  end if;');
p();
p('  -- Mediodia y no medianoche: el 7 de septiembre de 2025 las 00:00 no');
p('  -- existen en Chile por el cambio de hora. A mediodia no hay ambiguedad.');
p('  insert into public.transacciones');
p('    (id, tipo, monto, fecha, fuente_id, fuente_destino_id, establecimiento_id,');
p('     nota, monto_sin_detalle, user_id)');
p('  select m.id, m.tipo, m.monto,');
p(`         ((m.fecha + time '12:00') at time zone ${txt(ZONA)}),`);
p("         case m.fuente when 'santander' then v_sant when 'rut' then v_rut");
p("                       when 'ahorro' then v_ahorro end,");
p("         case m.destino when 'santander' then v_sant when 'rut' then v_rut");
p("                        when 'ahorro' then v_ahorro end,");
p('         e.id, m.nota,');
p("         case when m.tipo = 'egreso' and m.sin_detalle then m.monto else 0 end,");
p('         v_usuario');
p('    from tmp_mov m');
p('    left join public.establecimientos e');
p('      on e.user_id = v_usuario');
p('     and public.normalizar_texto(e.nombre) = public.normalizar_texto(m.establecimiento)');
p('  on conflict (id) do nothing;');
p('  get diagnostics v_tx = row_count;');
p();
p('  insert into public.items_detalle');
p('    (transaccion_id, nombre_producto, categoria_id, producto_id, unidades,');
p('     cantidad_medida, precio_unitario, descuento_monto, user_id)');
p('  select m.id, m.producto, p.categoria_id, p.id, m.unidades,');
p('         m.cantidad_medida, m.precio_unitario, coalesce(m.descuento_unitario, 0), v_usuario');
p('    from tmp_mov m');
p('    -- lateral con limit 1, y no un join a secas: la 0012 ya creo productos');
p('    -- con 14 de estos nombres. Si alguno quedo con marca o formato distinto,');
p('    -- coexisten dos filas con el mismo nombre y un join normal duplicaria el');
p('    -- item. Se toma el mas antiguo, que es la identidad que ya estaba en uso.');
p('    cross join lateral (');
p('      select p.id, p.categoria_id');
p('        from public.productos p');
p('       where p.user_id = v_usuario');
p('         and public.normalizar_texto(p.nombre) = public.normalizar_texto(m.producto)');
p('       order by p.created_at, p.id');
p('       limit 1');
p('    ) p');
p("   where m.tipo = 'egreso' and not m.sin_detalle");
p('     and not exists (select 1 from public.items_detalle i where i.transaccion_id = m.id);');
p('  get diagnostics v_items = row_count;');
p();
p("  raise notice 'Establecimientos nuevos: %', v_est;");
p("  raise notice 'Productos nuevos: %', v_prod;");
p("  raise notice 'Transacciones insertadas: %', v_tx;");
p("  raise notice 'Items de detalle: %', v_items;");
p();
p('  -- Las aperturas: el punto desde el que se empieza a contar. Sin ellas los');
p('  -- saldos arrancarian en cero y no cuadrarian con tu Control mensual.');
p('  insert into public.ajustes_saldos');
p('    (id, fuente_id, fecha_referencia, monto_ajustado, nota, motivo, user_id)');
p('  select a.id,');
p("         case a.fuente when 'santander' then v_sant when 'rut' then v_rut");
p("                       when 'ahorro' then v_ahorro end,");
p("         a.fecha, a.monto, a.nota, 'apertura', v_usuario");
p('    from tmp_aj a');
p('  on conflict (id) do nothing;');
p('  get diagnostics v_tx = row_count;');
p("  raise notice 'Aperturas: %', v_tx;");
p();
p('  -- Los dos ajustes de junio 2026 cambian de significado al existir el');
p('  -- historico. Antes eran el unico origen de esa plata, asi que la 0019 los');
p('  -- marcaba como ingreso no anotado. Ahora se ve lo que tapaban: el hueco');
p('  -- de febrero a mayo de 2026, cuatro meses sin registrar en los que el');
p('  -- sueldo siguio llegando. Contarlos como ingreso de junio meteria cinco');
p('  -- meses de sueldo en un mes, que es el mismo error de antes al reves.');
p('  -- Como apertura dicen lo que son: el punto desde el que se vuelve a');
p('  -- contar.');
p("  update public.ajustes_saldos set motivo = 'apertura'");
p("   where user_id = v_usuario and motivo = 'ingreso_no_registrado'");
p(`     and fecha_referencia >= date '2026-02-01'`);
p(`     and fecha_referencia <  date '2026-07-01';`);
p('  get diagnostics v_tx = row_count;');
p("  raise notice 'Ajustes reclasificados como apertura: %', v_tx;");
p('end $$;');
p();
p('commit;');
p();

// --- comprobación posterior
p('-- ------------------------------------------------- Comprobacion posterior');
p('-- Compara mes a mes con los totales de tu Control mensual.');
p('select to_char(t.fecha at time zone ' + txt(ZONA) + ", 'YYYY-MM') as mes,");
p("       sum(t.monto) filter (where t.tipo = 'ingreso')       as ingresos,");
p("       sum(t.monto) filter (where t.tipo = 'egreso')        as gastos,");
p("       sum(t.monto) filter (where t.tipo = 'transferencia') as traspasos,");
p('       count(*)                                             as movimientos');
p('  from public.transacciones t');
p(' group by 1 order by 1;');

const sql = aAscii(L.join('\n') + '\n');
const noAscii = [...sql].filter((c) => c.codePointAt(0) > 127);
if (noAscii.length) {
  console.error(`FALLO: quedaron ${noAscii.length} caracteres no ASCII: ${[...new Set(noAscii)].join(' ')}`);
  process.exit(1);
}

mkdirSync('privado', { recursive: true });
writeFileSync('privado/0021_historico.sql', sql, 'ascii');

// -------------------------------------------------------------------- informe

const suma = (f) => movimientos.filter(f).reduce((s, m) => s + m.monto, 0);
const ingresos = suma((m) => m.tipo === 'ingreso');
const gastos = suma((m) => m.tipo === 'egreso');
const traspasosTotal = suma((m) => m.tipo === 'transferencia');

console.log(`\nEscrito privado/0021_historico.sql  (${sql.split('\n').length} lineas, ASCII puro)\n`);
console.log(`  Movimientos      ${String(movimientos.length).padStart(5)}`);
console.log(`    ingresos       ${String(movimientos.filter((m) => m.tipo === 'ingreso').length).padStart(5)}   ${clp(ingresos).padStart(12)}`);
console.log(`      de los cuales sueldo, que no estaba en el libro: ${clp(sueldoTotal)}`);
console.log(`    gastos         ${String(movimientos.filter((m) => m.tipo === 'egreso').length).padStart(5)}   ${clp(gastos).padStart(12)}`);
console.log(`      sin desglose ${String(canastas).padStart(5)}   (van con monto_sin_detalle)`);
console.log(`    traspasos      ${String(movimientos.filter((m) => m.tipo === 'transferencia').length).padStart(5)}   ${clp(traspasosTotal).padStart(12)}   (no cuentan como gasto)`);
console.log(`  Productos        ${String(productos.size).padStart(5)}`);
console.log(`  Establecimientos ${String(establecimientos.size).padStart(5)}`);
console.log(`  Clasificados por regla: ${conRegla} de ${movimientos.filter((m) => m.tipo === 'egreso').length} gastos`);
console.log(`  Margen del periodo: ${clp(ingresos - gastos)}`);
for (const a of avisos) console.log(`  AVISO  ${a}`);

// Reconciliación contra el propio Control mensual del Sheet.
console.log('\n  Reconciliacion contra tu Control mensual (solo Santander, como el)');
console.log('  mes       control      importado   dif');
let descuadres = 0;
for (const f of control.slice(1)) {
  if (!f?.[0] || !f?.[1]) continue;
  const m = MESES.indexOf(String(f[1]));
  if (m < 0) continue;
  const mes = `${f[0]}-${String(m + 1).padStart(2, '0')}`;
  if (`${mes}-01` >= CORTE) continue;
  const ctrl = Number(f[6]);
  if (!Number.isFinite(ctrl) || ctrl === 0) continue;
  // El Control cuenta traspasos y ahorro como salida; la app ya no.
  const mio = movimientos
    .filter((x) => mesDe(x.fecha) === mes && x.fuente === 'santander' && (x.tipo === 'egreso' || x.tipo === 'transferencia'))
    .reduce((s, x) => s + x.monto, 0);
  if (mio !== ctrl) descuadres += 1;
  console.log(`  ${mes}  ${clp(ctrl).padStart(11)}  ${clp(mio).padStart(11)}  ${mio === ctrl ? 'ok' : clp(mio - ctrl)}`);
}
console.log(`\n  Descuadres: ${descuadres}`);

/**
 * La prueba de fuego: reconstruir el saldo de Santander como lo hará la app
 * —apertura más movimientos— y compararlo con la columna «Cta Cor Sant» de tu
 * Control mensual. Si cuadra mes a mes, la conversión es fiel: no basta con
 * que cuadren los totales, tienen que cuadrar los saldos.
 */
console.log('\n  Saldo de Santander al cierre de cada mes');
console.log('  mes        tu planilla   reconstruido   dif');
const apertura = ajustes.find((a) => a.fuente === 'santander');
let saldoMalos = 0;
for (const f of control.slice(1)) {
  if (!f?.[0] || !f?.[1]) continue;
  const m = MESES.indexOf(String(f[1]));
  if (m < 0) continue;
  const mes = `${f[0]}-${String(m + 1).padStart(2, '0')}`;
  if (`${mes}-01` >= CORTE) continue;
  const suyo = Number(f[7]);
  // Solo los meses que tu planilla llegó a calcular. En los vacíos escribe 0,
  // pero un saldo no se pone a cero porque dejes de anotar: se arrastra. Ese
  // es justo el «cero inventado» que la app dejó de dibujar.
  if (!Number.isFinite(suyo) || !(Number(f[3]) > 0 || Number(f[6]) > 0)) continue;
  const cierre = `${mes}-31`;
  let saldo = apertura && apertura.fecha <= cierre ? apertura.monto : 0;
  for (const x of movimientos) {
    if (x.fecha < (apertura?.fecha ?? '0000') || x.fecha > cierre) continue;
    if (x.fuente === 'santander' && x.tipo === 'ingreso') saldo += x.monto;
    if (x.fuente === 'santander' && (x.tipo === 'egreso' || x.tipo === 'transferencia')) saldo -= x.monto;
    if (x.destino === 'santander') saldo += x.monto;
  }
  const ok = Math.abs(saldo - suyo) < 1;
  if (!ok) saldoMalos += 1;
  console.log(`  ${mes}   ${clp(suyo).padStart(11)}   ${clp(saldo).padStart(12)}   ${ok ? 'ok' : clp(saldo - suyo)}`);
}
console.log(`\n  Saldos que no cuadran: ${saldoMalos}`);

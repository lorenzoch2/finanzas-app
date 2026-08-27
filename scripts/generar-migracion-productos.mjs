/**
 * Genera supabase/migrations/0012_productos.sql desde el backup.
 *
 * Crea el catálogo de productos a partir de los ítems históricos y resuelve
 * de paso el campo `peso_volumen`, que mezclaba tres conceptos distintos en
 * texto libre.
 *
 * La interpretación de esos 17 formatos NO se puede hacer con una expresión
 * regular, porque el mismo texto significa cosas distintas según el producto:
 * «4 kg» en unas pesas tobilleras es el peso del objeto, mientras que «250 g»
 * en un chocolate es el contenido del envase. Por eso cada caso se decide
 * aquí, explícitamente, y el SQL sale ya resuelto y auditable.
 *
 *   node scripts/generar-migracion-productos.mjs [dir-backup]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizar, subcategoriaDe } from './taxonomia.mjs';

const dir = process.argv[2] ?? join('backups', readFileSync('backups/ULTIMO.txt', 'utf8').trim());
const items = JSON.parse(readFileSync(join(dir, 'items_detalle.json'), 'utf8')).filter(
  (i) => i.nombre_producto !== 'Gasto sin detalle',
);

const esc = (s) => String(s).replace(/'/g, "''");

/**
 * Cómo se interpreta cada valor histórico de `peso_volumen`.
 *
 *   contenido  — cuánto trae el envase. Va en el producto y permite calcular
 *                el precio por unidad de medida.
 *   granel     — se vende por peso y el peso cambia en cada compra. Va en la
 *                compra, no en el producto.
 *   atributo   — describe el objeto y distingue variantes. Pasa a formar
 *                parte del nombre del producto: una tapa de olla de 14 cm y
 *                otra de 24 cm son productos distintos, no el mismo con dos
 *                medidas.
 */
const INTERPRETACION = {
  '170g': { tipo: 'contenido', cantidad: 170, unidad: 'g' },
  '250g': { tipo: 'contenido', cantidad: 250, unidad: 'g' },
  '500g': { tipo: 'contenido', cantidad: 500, unidad: 'g' },
  // Sin unidad, pero hay otra fila del MISMO producto (Pechuga Pollo Ariztía)
  // que dice «500g». De ahí se deduce que son gramos.
  '500': { tipo: 'contenido', cantidad: 500, unidad: 'g' },
  '300 gr': { tipo: 'contenido', cantidad: 300, unidad: 'g' },
  '480 gr': { tipo: 'contenido', cantidad: 480, unidad: 'g' },
  '1kg': { tipo: 'contenido', cantidad: 1, unidad: 'kg' },
  '4': { tipo: 'contenido', cantidad: 4, unidad: 'unidad' },
  '2': { tipo: 'contenido', cantidad: 2, unidad: 'unidad' },
  '3': { tipo: 'contenido', cantidad: 3, unidad: 'unidad' },
  '30': { tipo: 'contenido', cantidad: 30, unidad: 'unidad' },

  '0.674kg': { tipo: 'granel', unidad: 'kg' },
  '0.546 kg': { tipo: 'granel', unidad: 'kg' },

  '15cm': { tipo: 'atributo', sufijo: '15 cm' },
  '14 cm': { tipo: 'atributo', sufijo: '14 cm' },
  '24 cm': { tipo: 'atributo', sufijo: '24 cm' },
  '4kg': { tipo: 'atributo', sufijo: '4 kg' },
};

/** Entre variantes del mismo texto, se prefiere la que lleva tildes. */
const mejorVariante = (variantes) => {
  const conteo = new Map();
  for (const v of variantes) conteo.set(v, (conteo.get(v) ?? 0) + 1);

  return [...conteo.entries()].sort((a, b) => {
    const tildesA = (a[0].match(/[áéíóúñÁÉÍÓÚÑ]/g) ?? []).length;
    const tildesB = (b[0].match(/[áéíóúñÁÉÍÓÚÑ]/g) ?? []).length;
    if (tildesA !== tildesB) return tildesB - tildesA;
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], 'es');
  })[0][0];
};

// --- Agrupar ítems en productos ---
const grupos = new Map();

for (const item of items) {
  const interp = item.peso_volumen ? INTERPRETACION[item.peso_volumen] : undefined;
  if (item.peso_volumen && !interp) {
    console.error(`Formato de peso_volumen sin interpretar: "${item.peso_volumen}"`);
    process.exit(1);
  }

  const sufijo = interp?.tipo === 'atributo' ? ` ${interp.sufijo}` : '';
  const nombreBase = (item.nombre_producto ?? '').trim();
  const nombre = nombreBase + sufijo;

  const clave = [
    normalizar(nombre),
    normalizar(item.marca ?? ''),
    interp?.tipo === 'contenido' ? `${interp.cantidad}${interp.unidad}` : '',
    interp?.tipo === 'granel' ? 'granel' : '',
  ].join('|');

  if (!grupos.has(clave)) {
    grupos.set(clave, {
      nombres: [],
      marcas: [],
      subcategoria: subcategoriaDe(nombreBase),
      contenidoCantidad: interp?.tipo === 'contenido' ? interp.cantidad : null,
      contenidoUnidad: interp?.tipo === 'contenido' ? interp.unidad : null,
      vendidoPor: interp?.tipo === 'granel' ? 'peso' : 'unidad',
      unidadGranel: interp?.tipo === 'granel' ? interp.unidad : null,
      items: [],
    });
  }

  const g = grupos.get(clave);
  g.nombres.push(nombre);
  if (item.marca) g.marcas.push(item.marca.trim());
  g.items.push(item);
}

// --- Emitir ---
const productos = [...grupos.values()].map((g) => ({
  nombre: mejorVariante(g.nombres),
  marca: g.marcas.length ? mejorVariante(g.marcas) : null,
  subcategoria: g.subcategoria,
  contenidoCantidad: g.contenidoCantidad,
  contenidoUnidad: g.contenidoUnidad,
  vendidoPor: g.vendidoPor,
  items: g.items,
}));

const filasProductos = productos
  .map(
    (p) =>
      `    ('${esc(p.nombre)}', ${p.marca ? `'${esc(p.marca)}'` : 'null'}, ` +
      `${p.subcategoria ? `'${esc(p.subcategoria)}'` : 'null'}, ` +
      `${p.contenidoCantidad ?? 'null'}, ${p.contenidoUnidad ? `'${p.contenidoUnidad}'` : 'null'}, ` +
      `'${p.vendidoPor}')`,
  )
  .join(',\n');

// Cada ítem histórico apuntando a su producto, y su peso real si es granel.
const filasVinculo = productos
  .flatMap((p) =>
    p.items.map((item) => {
      const granel =
        p.vendidoPor === 'peso' && item.peso_volumen
          ? parseFloat(String(item.peso_volumen).replace(/[^\d.]/g, ''))
          : null;
      return `    ('${item.id}'::uuid, '${esc(p.nombre)}', ${p.marca ? `'${esc(p.marca)}'` : 'null'}, ${granel ?? 'null'})`;
    }),
  )
  .join(',\n');

const conGranel = productos.filter((p) => p.vendidoPor === 'peso');
const conContenido = productos.filter((p) => p.contenidoCantidad != null);

const sql = `-- 0012 — Catálogo de productos y unidades estructuradas
--
-- GENERADO por scripts/generar-migracion-productos.mjs. No editar a mano.
--
-- Dos problemas que resuelve:
--
-- 1. IDENTIDAD DE PRODUCTO. El nombre era texto libre y ya se estaba
--    duplicando: «Colún» y «Colun», «Pechuga Pollo» y «Pechuga pollo». Sin
--    identidad estable no se puede comparar el mismo producto entre
--    establecimientos ni seguir su precio en el tiempo, que es justo para lo
--    que se quiere el catálogo.
--
-- 2. \`peso_volumen\` MEZCLABA TRES COSAS en un texto libre con 17 formatos:
--
--      contenido del envase   170 g café, 250 g chocolate, 30 huevos, 4 rollos
--                             -> va en el producto: no cambia entre compras
--
--      peso variable          0,674 kg de hallulla, 0,546 kg de pan
--                             -> va en la compra: cambia cada vez
--
--      atributo del objeto    tapa de olla de 14 cm frente a una de 24 cm
--                             -> pasa al nombre: son productos distintos
--
--    El mismo texto significaba cosas distintas según el producto («4 kg» en
--    unas pesas es el peso del objeto; «250 g» en un chocolate es contenido),
--    así que la interpretación se decidió caso por caso, no con una regla
--    automática.
--
-- Resultado: ${productos.length} productos, ${conContenido.length} con contenido medible y ${conGranel.length} vendidos a granel.

begin;

-- Normalización estable para comparar nombres. Sin extensión unaccent:
-- translate() basta para el español y es inmutable, que es lo que exige un
-- índice único.
create or replace function public.normalizar_texto(t text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(trim(regexp_replace(
    translate(
      t,
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    ),
    '\\s+', ' ', 'g')))
$$;

create table if not exists public.productos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre              text not null,
  marca               text,
  categoria_id        uuid references public.categorias(id) on delete set null,
  contenido_cantidad  numeric,
  contenido_unidad    text,
  vendido_por         text not null default 'unidad',
  created_at          timestamptz not null default now(),

  constraint chk_productos_unidad
    check (contenido_unidad is null or contenido_unidad in ('g','kg','ml','l','unidad')),
  constraint chk_productos_vendido
    check (vendido_por in ('unidad','peso')),
  constraint chk_productos_contenido
    check (contenido_cantidad is null or contenido_cantidad > 0)
);

-- Lo que impide que vuelvan a existir dos «Leche Entera Colún» distintos.
create unique index if not exists uq_productos_identidad
  on public.productos (
    user_id,
    public.normalizar_texto(nombre),
    coalesce(public.normalizar_texto(marca), ''),
    coalesce(contenido_cantidad, -1),
    coalesce(contenido_unidad, '')
  );

create index if not exists idx_productos_categoria on public.productos (categoria_id);

alter table public.productos enable row level security;
alter table public.productos force row level security;
drop policy if exists productos_propios on public.productos;
create policy productos_propios on public.productos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.productos from anon;

-- El peso real de una compra a granel: cambia en cada compra, así que vive
-- en el ítem y no en el producto.
alter table public.items_detalle
  add column if not exists producto_id uuid references public.productos(id) on delete set null,
  add column if not exists cantidad_medida numeric;

create index if not exists idx_items_producto on public.items_detalle (producto_id);

-- ------------------------------------------------------------ Backfill
do $$
declare
  v_usuario uuid;
  v_creados int;
  v_ligados int;
  v_huerfanos int;
begin
  select id into v_usuario from auth.users limit 1;
  if v_usuario is null then
    raise exception 'No hay usuario en auth.users.';
  end if;

  create temporary table tmp_productos (
    nombre text, marca text, subcategoria text,
    contenido_cantidad numeric, contenido_unidad text, vendido_por text
  ) on commit drop;

  insert into tmp_productos values
${filasProductos};

  insert into public.productos
    (nombre, marca, categoria_id, contenido_cantidad, contenido_unidad, vendido_por, user_id)
  select
    t.nombre, t.marca,
    (select c.id from public.categorias c
      where c.nombre = t.subcategoria and c.parent_id is not null and c.user_id = v_usuario
      limit 1),
    t.contenido_cantidad, t.contenido_unidad, t.vendido_por, v_usuario
  from tmp_productos t
  on conflict do nothing;

  get diagnostics v_creados = row_count;
  raise notice 'Productos creados: %', v_creados;

  -- Vincular cada ítem con su producto y guardar el peso real si era granel.
  create temporary table tmp_vinculo (
    item_id uuid, nombre text, marca text, cantidad_medida numeric
  ) on commit drop;

  insert into tmp_vinculo values
${filasVinculo};

  update public.items_detalle i
  set producto_id = p.id,
      cantidad_medida = v.cantidad_medida
  from tmp_vinculo v
  join public.productos p
    on public.normalizar_texto(p.nombre) = public.normalizar_texto(v.nombre)
   and coalesce(public.normalizar_texto(p.marca), '') = coalesce(public.normalizar_texto(v.marca), '')
   and p.user_id = v_usuario
  where i.id = v.item_id;

  get diagnostics v_ligados = row_count;
  raise notice 'Ítems vinculados a un producto: %', v_ligados;

  select count(*) into v_huerfanos from public.items_detalle where producto_id is null;
  if v_huerfanos > 0 then
    raise warning '% ítems quedaron sin producto.', v_huerfanos;
  else
    raise notice 'Todos los ítems tienen producto.';
  end if;
end $$;

-- Ya no hace falta: su contenido vive ahora en tres sitios distintos, cada
-- uno con su significado.
alter table public.items_detalle drop column if exists peso_volumen;

commit;
`;

const salida = 'supabase/migrations/0012_productos.sql';
writeFileSync(salida, sql);

console.log(`Generado ${salida}`);
console.log(`  ${productos.length} productos`);
console.log(`  ${conContenido.length} con contenido medible`);
console.log(`  ${conGranel.length} vendidos a granel`);
console.log(`  ${items.length} ítems vinculados`);

const sinCategoria = productos.filter((p) => !p.subcategoria);
if (sinCategoria.length) {
  console.log(`\n  Sin categoría: ${sinCategoria.map((p) => p.nombre).join(', ')}`);
}

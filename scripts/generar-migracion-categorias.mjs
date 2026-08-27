/**
 * Genera supabase/migrations/0011_categorias_v3.sql desde scripts/taxonomia.mjs.
 *
 * Se genera en vez de escribirse a mano para que la taxonomía que revisaste y
 * el SQL que se aplica no puedan divergir: hay una sola fuente de verdad.
 *
 * El mapeo se emite con los nombres EXACTOS que existen en tus datos, no con
 * expresiones de normalización en SQL. Así se evita depender de la extensión
 * unaccent y, sobre todo, el resultado es auditable: se ve fila por fila qué
 * producto va a qué subcategoría.
 *
 *   node scripts/generar-migracion-categorias.mjs [dir-backup]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAXONOMIA, subcategoriaDe } from './taxonomia.mjs';

const dir = process.argv[2] ?? join('backups', readFileSync('backups/ULTIMO.txt', 'utf8').trim());
const items = JSON.parse(readFileSync(join(dir, 'items_detalle.json'), 'utf8')).filter(
  (i) => i.nombre_producto !== 'Gasto sin detalle',
);

const esc = (s) => String(s).replace(/'/g, "''");

// Nombres exactos presentes en los datos, con su destino.
const nombres = [...new Set(items.map((i) => i.nombre_producto).filter(Boolean))].sort((a, b) =>
  a.localeCompare(b, 'es'),
);

const sinMapear = nombres.filter((n) => !subcategoriaDe(n));
if (sinMapear.length) {
  console.error('Hay productos sin mapear. Arregla scripts/taxonomia.mjs antes de generar:');
  sinMapear.forEach((n) => console.error('  ' + n));
  process.exit(1);
}

const filasMapeo = nombres
  .map((n) => `    ('${esc(n)}', '${esc(subcategoriaDe(n))}')`)
  .join(',\n');

const filasTaxonomia = Object.entries(TAXONOMIA)
  .flatMap(([padre, hijas]) => [
    `    ('${esc(padre)}', null)`,
    ...hijas.map((h) => `    ('${esc(h)}', '${esc(padre)}')`),
  ])
  .join(',\n');

const totalCategorias =
  Object.keys(TAXONOMIA).length + Object.values(TAXONOMIA).flat().length;

const sql = `-- 0011 — Taxonomía de categorías v3
--
-- GENERADO por scripts/generar-migracion-categorias.mjs desde
-- scripts/taxonomia.mjs. No editar a mano: regenerar.
--
-- Por qué se rehace la taxonomía:
--
--   * De las 17 categorías anteriores, 7 no se usaron nunca.
--   * «Alimentación» acumulaba 40 ítems mezclando compra de supermercado,
--     comida al paso, snacks, bebidas y suplementos deportivos. Con todo en
--     el mismo saco no se podía analizar nada.
--   * 27 ítems (29%) estaban sin categoría porque no existía ninguna donde
--     pusieran encajar: menaje, muebles, ferretería.
--   * Un mismo tipo de gasto se clasificaba distinto según el día: «Pizza» y
--     «Café» aparecían a la vez en «Alimentación» y en «Restaurantes».
--
-- Resultado: ${totalCategorias} categorías (${Object.keys(TAXONOMIA).length} principales) y los ${nombres.length} productos
-- históricos mapeados uno por uno. Ningún ítem queda sin clasificar.
--
-- Reversible: el backup previo permite reconstruir el estado anterior.

begin;

-- ------------------------------------------- Apartar las categorías viejas
-- La taxonomía nueva reutiliza nombres que ya existen: Transporte, Educación,
-- Regalos, Viajes, Arriendo e Imprevistos. Como \`categorias\` no tiene
-- restricción de unicidad por nombre, buscar la categoría padre por su nombre
-- podría encontrar la ANTIGUA y colgar las subcategorías del sitio
-- equivocado, en silencio.
--
-- Renombrarlas antes elimina la ambigüedad. Al final del archivo se borran.
update public.categorias
set nombre = nombre || ' (antigua)'
where parent_id is null
  and nombre in (
    'Ahorro','Alimentación','Arriendo','Compras personales','Educación','Entretenimiento',
    'Higiene','Imprevistos','Internet/Telefonía','Regalos','Restaurantes/Comida Rápida',
    'Ropa','Salud','Servicios básicos','Suscripciones','Transporte','Viajes'
  );

-- ------------------------------------------------------- Taxonomía nueva
-- Se insertan primero las principales y luego las hijas, que necesitan el id
-- de su padre. El trigger anti-ciclos de 0003 sigue vigilando.
do $$
declare
  v_usuario uuid;
  r         record;
  v_padre   uuid;
begin
  select id into v_usuario from auth.users limit 1;
  if v_usuario is null then
    raise exception 'No hay usuario en auth.users.';
  end if;

  create temporary table tmp_taxonomia (nombre text, padre text) on commit drop;
  insert into tmp_taxonomia (nombre, padre) values
${filasTaxonomia};

  -- Principales
  for r in select nombre from tmp_taxonomia where padre is null loop
    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, null, v_usuario);
  end loop;

  -- Subcategorías
  for r in select nombre, padre from tmp_taxonomia where padre is not null loop
    select id into v_padre
      from public.categorias
      where nombre = r.padre and parent_id is null and user_id = v_usuario;

    if v_padre is null then
      raise exception 'No se encontró la categoría padre %', r.padre;
    end if;

    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, v_padre, v_usuario);
  end loop;
end $$;

-- --------------------------------------------------- Remapeo de los ítems
do $$
declare
  v_usuario   uuid;
  v_sin_mapa  int;
  v_migrados  int;
begin
  select id into v_usuario from auth.users limit 1;

  create temporary table tmp_mapeo (producto text, subcategoria text) on commit drop;
  insert into tmp_mapeo (producto, subcategoria) values
${filasMapeo};

  update public.items_detalle i
  set categoria_id = c.id
  from tmp_mapeo m
  join public.categorias c
    on c.nombre = m.subcategoria
   and c.parent_id is not null
   and c.user_id = v_usuario
  where i.nombre_producto = m.producto;

  get diagnostics v_migrados = row_count;
  raise notice 'Ítems recategorizados: %', v_migrados;

  -- Nada puede quedarse atrás sin que se note.
  select count(*) into v_sin_mapa
  from public.items_detalle i
  where i.categoria_id is null;

  if v_sin_mapa > 0 then
    raise warning '% ítems quedaron sin categoría. Revisa scripts/taxonomia.mjs.', v_sin_mapa;
  else
    raise notice 'Todos los ítems tienen categoría.';
  end if;
end $$;

-- ------------------------------------------------- Retirar las antiguas
-- Se reconocen por el sufijo que se les puso al principio, no por su nombre
-- original: así no hay forma de borrar por error una categoría nueva que se
-- llame igual.
--
-- Solo se van las que ya no usa nadie. Si alguna conservara ítems, se queda y
-- se avisa, en vez de arrastrarlos en silencio.
do $$
declare
  v_borradas int;
  v_en_uso   text;
begin
  select string_agg(distinct c.nombre, ', ')
  into v_en_uso
  from public.categorias c
  join public.items_detalle i on i.categoria_id = c.id
  where c.nombre like '%(antigua)';

  if v_en_uso is not null then
    raise warning 'Categorías antiguas todavía con ítems, no se borran: %', v_en_uso;
  end if;

  delete from public.categorias c
  where c.nombre like '%(antigua)'
    and not exists (select 1 from public.categorias h where h.parent_id = c.id)
    and not exists (select 1 from public.items_detalle i where i.categoria_id = c.id);
  -- No se comprueba \`productos\`: esa tabla nace en 0012, después de esta.

  get diagnostics v_borradas = row_count;
  raise notice 'Categorías antiguas retiradas: %', v_borradas;
end $$;

commit;
`;

const salida = 'supabase/migrations/0011_categorias_v3.sql';
writeFileSync(salida, sql);

console.log(`Generado ${salida}`);
console.log(`  ${Object.keys(TAXONOMIA).length} categorías principales`);
console.log(`  ${Object.values(TAXONOMIA).flat().length} subcategorías`);
console.log(`  ${nombres.length} productos mapeados`);

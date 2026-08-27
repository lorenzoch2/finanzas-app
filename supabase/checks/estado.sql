-- Estado actual de las categorias. Solo lectura.
--
-- Sirve para saber en que punto quedo la migracion 0010 si se ejecuto a
-- medias. Ejecutalo entero (sin seleccionar nada) y mira las tres tablas.

-- 1) Categorias que hay ahora mismo.
--    Las que terminan en "(antigua)" ya fueron apartadas por la migracion.
select
  case
    when nombre like '%(antigua)' then 'ya apartada'
    when parent_id is null        then 'principal'
    else 'subcategoria'
  end                                   as estado,
  count(*)                              as cuantas,
  string_agg(nombre, ', ' order by nombre) as nombres
from public.categorias
group by 1
order by 1;

-- 2) Cuantos items tienen categoria.
select
  count(*)                                          as items_totales,
  count(*) filter (where categoria_id is not null)   as con_categoria,
  count(*) filter (where categoria_id is null)       as sin_categoria
from public.items_detalle;

-- 3) Que tablas de la v3 ya existen.
select
  table_name,
  'ya existe' as estado
from information_schema.tables
where table_schema = 'public'
  and table_name in ('productos', 'establecimientos', 'presupuestos')
order by table_name;

-- Estado actual de la base. Solo lectura.
--
-- Ejecutalo ENTERO (sin seleccionar nada) y pasame las cinco tablas.

-- 1) TRIGGERS. Esto es lo que faltaba mirar: PostgREST expone tablas y
--    columnas, pero no triggers, asi que habia codigo ejecutandose en cada
--    escritura que no se veia desde fuera.
select
  c.relname                                   as tabla,
  t.tgname                                    as trigger,
  p.proname                                   as funcion,
  case t.tgenabled when 'D' then 'desactivado' else 'activo' end as estado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 2) FUNCIONES definidas en public, para ver si alguna quedo huerfana.
select
  p.proname                as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- 3) COLUMNAS reales de items_detalle, incluyendo cuales son generadas.
select
  column_name,
  data_type,
  is_generated,
  is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'items_detalle'
order by ordinal_position;

-- 4) Categorias: en que punto quedo la migracion.
select
  case
    when nombre like '%(antigua)' then 'ya apartada'
    when parent_id is null        then 'principal'
    else 'subcategoria'
  end                                      as estado,
  count(*)                                 as cuantas,
  string_agg(nombre, ', ' order by nombre) as nombres
from public.categorias
group by 1
order by 1;

-- 5) Conteos y tablas de la v3.
select 'items_detalle' as tabla, count(*) as filas,
       count(*) filter (where categoria_id is null) as sin_categoria
from public.items_detalle
union all
select 'transacciones', count(*), 0 from public.transacciones
union all
select 'fuentes_cuentas', count(*), 0 from public.fuentes_cuentas;

select table_name, 'ya existe' as estado
from information_schema.tables
where table_schema = 'public'
  and table_name in ('productos', 'establecimientos', 'presupuestos')
order by table_name;

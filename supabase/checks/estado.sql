-- Estado actual de la base. Solo lectura.
--
-- UNA sola consulta a proposito: el editor de Supabase muestra unicamente el
-- resultado del ultimo select, asi que un archivo con varios se ve a medias.
-- Aqui todo sale en una tabla de tres columnas.
--
-- Ejecutalo entero, sin seleccionar nada, y pasa el resultado completo.

with

-- Triggers: el punto ciego. PostgREST expone tablas y columnas, pero no
-- triggers, asi que puede haber codigo corriendo en cada escritura sin que
-- se vea desde fuera.
triggers as (
  select
    '1. TRIGGERS'                                  as seccion,
    c.relname || '.' || t.tgname                   as elemento,
    'funcion: ' || p.proname ||
      case t.tgenabled when 'D' then ' (desactivado)' else '' end as detalle
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p      on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal
),

-- Funciones propias, para detectar restos huerfanos.
funciones as (
  select
    '2. FUNCIONES'                                      as seccion,
    p.proname                                           as elemento,
    coalesce(nullif(pg_get_function_identity_arguments(p.oid), ''), 'sin argumentos') as detalle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
),

-- Columnas de items_detalle: cuales existen y cuales son generadas.
columnas as (
  select
    '3. COLUMNAS items_detalle' as seccion,
    column_name                 as elemento,
    data_type ||
      case when is_generated = 'ALWAYS' then ' (GENERADA)' else '' end as detalle
  from information_schema.columns
  where table_schema = 'public' and table_name = 'items_detalle'
),

-- Categorias: en que punto quedo la migracion.
categorias as (
  select
    '4. CATEGORIAS' as seccion,
    case
      when nombre like '%(antigua)' then 'ya apartadas'
      when parent_id is null        then 'principales'
      else 'subcategorias'
    end             as elemento,
    count(*)::text || ': ' || string_agg(nombre, ', ' order by nombre) as detalle
  from public.categorias
  group by 2
),

-- Conteos.
conteos as (
  select '5. CONTEOS' as seccion, 'items_detalle' as elemento,
         count(*)::text || ' filas, ' ||
         count(*) filter (where categoria_id is null)::text || ' sin categoria' as detalle
  from public.items_detalle
  union all
  select '5. CONTEOS', 'transacciones', count(*)::text || ' filas'
  from public.transacciones
  union all
  select '5. CONTEOS', 'fuentes_cuentas', count(*)::text || ' filas'
  from public.fuentes_cuentas
  union all
  select '5. CONTEOS', 'categorias', count(*)::text || ' filas'
  from public.categorias
),

-- Tablas de la v3: cuales ya existen.
tablas_v3 as (
  select
    '6. TABLAS v3' as seccion,
    t.nombre       as elemento,
    case
      when to_regclass('public.' || t.nombre) is null then 'NO existe todavia'
      else 'ya existe'
    end            as detalle
  from (values ('productos'), ('establecimientos'), ('presupuestos')) as t(nombre)
)

select seccion, elemento, detalle from triggers
union all select seccion, elemento, detalle from funciones
union all select seccion, elemento, detalle from columnas
union all select seccion, elemento, detalle from categorias
union all select seccion, elemento, detalle from conteos
union all select seccion, elemento, detalle from tablas_v3
order by seccion, elemento;

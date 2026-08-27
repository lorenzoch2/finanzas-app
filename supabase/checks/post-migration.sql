-- Verificacion POSTERIOR a las migraciones. Solo lectura.
--
-- UNA sola consulta: el editor de Supabase muestra unicamente el resultado
-- del ultimo select, asi que varios selects se ven a medias.
--
-- La columna "veredicto" dice si cada comprobacion cuadra. Si algo sale como
-- REVISAR, no sigas sin mirarlo.

with

conteos as (
  select 'items_detalle' as que, count(*)::text as valor, '93' as esperado
  from public.items_detalle
  union all
  select 'transacciones', count(*)::text, '91' from public.transacciones
  union all
  select 'fuentes_cuentas', count(*)::text, '3' from public.fuentes_cuentas
  union all
  select 'ajustes_saldos', count(*)::text, '2' from public.ajustes_saldos
  union all
  select 'categorias', count(*)::text, '51' from public.categorias
  union all
  select 'productos', count(*)::text, '75' from public.productos
),

integridad as (
  select 'items sin categoria' as que,
         count(*) filter (where categoria_id is null)::text as valor,
         '0' as esperado
  from public.items_detalle
  union all
  select 'items sin producto',
         count(*) filter (where producto_id is null)::text, '0'
  from public.items_detalle
  union all
  select 'items sin dueno',
         count(*) filter (where user_id is null)::text, '0'
  from public.items_detalle
  union all
  select 'categorias principales',
         count(*) filter (where parent_id is null)::text, '10'
  from public.categorias
  union all
  select 'categorias antiguas restantes',
         count(*) filter (where nombre like '%(antigua)')::text, '0'
  from public.categorias
  union all
  select 'cuentas principales',
         count(*) filter (where es_principal)::text, '1'
  from public.fuentes_cuentas
  union all
  select 'productos a granel',
         count(*) filter (where vendido_por = 'peso')::text, '2'
  from public.productos
  union all
  select 'productos con contenido',
         count(*) filter (where contenido_cantidad is not null)::text, '12'
  from public.productos
),

comprobaciones as (
  select
    '1. CONTEOS' as seccion, que as elemento,
    valor || ' (esperado ' || esperado || ')' as detalle,
    case when valor = esperado then 'ok' else 'REVISAR' end as veredicto
  from conteos
  union all
  select '2. INTEGRIDAD', que,
    valor || ' (esperado ' || esperado || ')',
    case when valor = esperado then 'ok' else 'REVISAR' end
  from integridad
),

-- peso_volumen debe haber desaparecido; las derivadas deben ser generadas.
esquema as (
  select
    '3. ESQUEMA' as seccion,
    'peso_volumen retirada' as elemento,
    case when to_regclass('public.items_detalle') is null then 'sin tabla'
         when exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='items_detalle'
             and column_name='peso_volumen'
         ) then 'todavia existe' else 'retirada' end as detalle,
    case when exists (
           select 1 from information_schema.columns
           where table_schema='public' and table_name='items_detalle'
             and column_name='peso_volumen'
         ) then 'REVISAR' else 'ok' end as veredicto
  union all
  select '3. ESQUEMA', 'columnas generadas',
    coalesce(string_agg(column_name, ', ' order by column_name), 'ninguna'),
    case when count(*) = 4 then 'ok' else 'REVISAR' end
  from information_schema.columns
  where table_schema='public' and table_name='items_detalle' and is_generated='ALWAYS'
),

-- Ningun trigger debe quedar tocando columnas eliminadas o generadas.
triggers as (
  select
    '4. TRIGGERS' as seccion,
    c.relname || '.' || t.tgname as elemento,
    'funcion: ' || p.proname as detalle,
    case when pg_get_functiondef(p.oid) ~* '(precio_original|peso_volumen|precio_final|descuento_porcentaje|tuvo_descuento|total_linea)'
         then 'REVISAR' else 'ok' end as veredicto
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p      on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal
),

-- RLS activo y forzado en todas las tablas de datos.
seguridad as (
  select
    '5. RLS' as seccion,
    c.relname as elemento,
    case when c.relrowsecurity then 'activo' else 'INACTIVO' end ||
    case when c.relforcerowsecurity then ' y forzado' else ', sin forzar' end as detalle,
    case when c.relrowsecurity and c.relforcerowsecurity then 'ok' else 'REVISAR' end as veredicto
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname in ('fuentes_cuentas','transacciones','items_detalle','ajustes_saldos',
                      'categorias','productos','establecimientos','presupuestos')
),

-- Las funciones que la app necesita deben existir.
funciones as (
  select
    '6. FUNCIONES' as seccion,
    f.nombre as elemento,
    case when to_regprocedure('public.' || f.nombre) is null
         then 'NO existe' else 'existe' end as detalle,
    case when to_regprocedure('public.' || f.nombre) is null
         then 'REVISAR' else 'ok' end as veredicto
  from (values
    ('saldos_por_fuente(date, text)'),
    ('resumen_mensual(date, text)'),
    ('guardar_transaccion(jsonb, jsonb, uuid)'),
    ('borrar_transaccion(uuid)'),
    ('avance_presupuesto(date, text)'),
    ('normalizar_texto(text)')
  ) as f(nombre)
)

select seccion, elemento, detalle, veredicto from comprobaciones
union all select seccion, elemento, detalle, veredicto from esquema
union all select seccion, elemento, detalle, veredicto from triggers
union all select seccion, elemento, detalle, veredicto from seguridad
union all select seccion, elemento, detalle, veredicto from funciones
order by seccion, veredicto desc, elemento;

-- 0018 — Todo por rango de fechas, no por mes
--
-- El mes deja de estar incrustado en las funciones y pasa a ser lo que
-- siempre debió ser: un rango como cualquier otro, el más habitual. Así
-- «diciembre», «los últimos tres meses» y «del 3 al 17» son la misma consulta
-- con distintos extremos, en vez de tres caminos separados.
--
-- Las firmas cambian, así que las funciones se sueltan y se recrean. Es
-- seguro tanto si la 0016 ya se aplicó como si no.
--
-- Convención: [p_desde, p_hasta] con AMBOS extremos incluidos. Un rango de un
-- solo día es desde = hasta, que es lo que espera cualquiera que elija esa
-- fecha dos veces en un calendario. Internamente se traduce a
-- [inicio, fin+1) para poder comparar contra instantes.

begin;

-- ------------------------------------------------------------ Saldos
-- Antes recibía un mes y calculaba hasta su cierre. Ahora recibe la fecha de
-- corte directamente: el saldo «a fecha de».
drop function if exists public.saldos_por_fuente(date, text);

create function public.saldos_por_fuente(
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (
  fuente_id     uuid,
  nombre        text,
  tipo          text,
  es_principal  boolean,
  saldo_inicial numeric,
  saldo_actual  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (p_hasta + 1)                                        as dia_siguiente,
      ((p_hasta + 1)::timestamp at time zone p_tz)          as corte_ts
  ),
  ultimo_ajuste as (
    select distinct on (a.fuente_id)
      a.fuente_id, a.monto_ajustado, a.fecha_referencia
    from public.ajustes_saldos a
    cross join limites l
    where a.fecha_referencia < l.dia_siguiente
    order by a.fuente_id, a.fecha_referencia desc
  )
  select
    f.id, f.nombre, f.tipo, f.es_principal,
    coalesce(u.monto_ajustado, 0)::numeric,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(
            case
              when t.tipo = 'ingreso'                                  then  t.monto
              when t.tipo = 'egreso'                                   then -t.monto
              when t.tipo = 'transferencia' and t.fuente_id = f.id      then -t.monto
              when t.tipo = 'transferencia' and t.fuente_destino_id = f.id then t.monto
              else 0
            end
          )
          from public.transacciones t
          cross join limites l2
          where (t.fuente_id = f.id or t.fuente_destino_id = f.id)
            and t.fecha >= coalesce(
                  (u.fecha_referencia::timestamp at time zone p_tz),
                  ('2020-01-01 00:00:00'::timestamp at time zone p_tz)
                )
            and t.fecha < l2.corte_ts
        ), 0)
    )::numeric
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.es_principal desc, f.nombre;
$$;

-- ----------------------------------------------------------- Resumen
drop function if exists public.resumen_mensual(date, text);

create function public.resumen_periodo(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (ingresos numeric, gastos numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric
  from public.transacciones t, l
  where t.fecha >= l.inicio and t.fecha < l.fin;
$$;

-- ------------------------------------------------- Gasto por categoría
-- Incluye el gasto NO detallado: partir solo de items_detalle dejaría fuera
-- todo egreso sin desglose, que hoy es una quinta parte del dinero. Un
-- gráfico que se come el 20% sin avisar invita a conclusiones falsas sobre el
-- resto.
drop function if exists public.gasto_por_categoria(date, text);

create function public.gasto_por_categoria(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (categoria_padre text, categoria text, total numeric, items bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  ),
  detallado as (
    select
      coalesce(padre.nombre, 'Sin categoría') as categoria_padre,
      coalesce(cat.nombre, 'Sin categoría')   as categoria,
      sum(i.total_linea)::numeric             as total,
      count(*)::bigint                        as items
    from public.items_detalle i
    join public.transacciones t on t.id = i.transaccion_id
    cross join l
    left join public.categorias cat   on cat.id = i.categoria_id
    left join public.categorias padre on padre.id = cat.parent_id
    where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
    group by 1, 2
    having sum(i.total_linea) > 0
  ),
  resto as (
    select
      'Sin detalle'::text, 'Sin detalle'::text,
      sum(greatest(t.monto - coalesce(d.suma, 0), 0))::numeric,
      count(*)::bigint
    from public.transacciones t
    cross join l
    left join (
      select transaccion_id, sum(total_linea) as suma
      from public.items_detalle group by transaccion_id
    ) d on d.transaccion_id = t.id
    where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
      and greatest(t.monto - coalesce(d.suma, 0), 0) > 0
  )
  select * from detallado
  union all
  select * from resto where total > 0
  order by 3 desc;
$$;

-- --------------------------------------------------------- Evolución
-- Sigue siendo mensual porque su pregunta es «¿cómo cambia mes a mes?», pero
-- ahora los meses salen del rango elegido en vez de ser siempre los últimos N.
drop function if exists public.evolucion_mensual(int, text);

create function public.evolucion_mensual(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (mes date, ingresos numeric, gastos numeric, limite numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with meses as (
    select generate_series(
      date_trunc('month', p_desde),
      date_trunc('month', p_hasta),
      interval '1 month'
    )::date as mes
  )
  select
    m.mes,
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric,
    -- El límite que regía ese mes, no el actual: cambiarlo hoy no debe
    -- reescribir con qué se comparaba enero.
    coalesce((
      select p.monto from public.presupuestos p
      where p.categoria_id is null
        and p.fecha_inicio <= (m.mes + interval '1 month' - interval '1 day')::date
        and p.fecha_fin    >= m.mes
        and not exists (select 1 from public.presupuesto_fuentes pf where pf.presupuesto_id = p.id)
      order by p.fecha_inicio desc limit 1
    ), 0)::numeric
  from meses m
  left join public.transacciones t
    on t.fecha >= (m.mes::timestamp at time zone p_tz)
   and t.fecha <  ((m.mes + interval '1 month')::timestamp at time zone p_tz)
   and t.tipo in ('ingreso', 'egreso')
  group by m.mes
  order by m.mes;
$$;

-- ----------------------------------------------- Gasto por establecimiento
drop function if exists public.gasto_por_establecimiento(date, text);

create function public.gasto_por_establecimiento(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (establecimiento text, tipo text, total numeric, visitas bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    coalesce(e.tipo, 'otro'),
    sum(t.monto)::numeric,
    count(*)::bigint
  from public.transacciones t
  cross join l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1, 2
  order by 3 desc;
$$;

-- -------------------------------------------------- Ranking de productos
drop function if exists public.ranking_productos(date, text, int);

create function public.ranking_productos(
  p_desde  date,
  p_hasta  date,
  p_tz     text default 'America/Santiago',
  p_limite int  default 15
)
returns table (producto text, marca text, total numeric, veces bigint, calificacion numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(p.nombre, i.nombre_producto, 'Sin nombre'),
    coalesce(p.marca, i.marca),
    sum(i.total_linea)::numeric,
    count(*)::bigint,
    avg(i.calificacion)::numeric
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join l
  left join public.productos p on p.id = i.producto_id
  where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1, 2
  order by 3 desc
  limit p_limite;
$$;

-- ------------------------------------------------ Ahorro por descuentos
drop function if exists public.ahorro_descuentos(date, text);

create function public.ahorro_descuentos(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (establecimiento text, ahorrado numeric, items bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    sum(i.descuento_monto * coalesce(i.unidades, 1))::numeric,
    count(*)::bigint
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso' and i.descuento_monto > 0
    and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1
  order by 2 desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'saldos_por_fuente(date, text)',
    'resumen_periodo(date, date, text)',
    'gasto_por_categoria(date, date, text)',
    'evolucion_mensual(date, date, text)',
    'gasto_por_establecimiento(date, date, text)',
    'ranking_productos(date, date, text, int)',
    'ahorro_descuentos(date, date, text)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
    execute format('revoke execute on function public.%s from public', f);
  end loop;
end $$;

commit;

-- 0006 — Cálculo de saldos en la base de datos
--
-- Hoy `useFuentes` descarga TODAS las transacciones (sin filtro ni límite) y
-- recalcula los saldos en el navegador en cada render del Dashboard. Con 91
-- filas se nota poco; crece linealmente para siempre.
--
-- Estas funciones replican EXACTAMENTE la regla actual
-- (src/hooks/useFuentes.js:19-45):
--
--   1. Se toma el último ajuste de la fuente con fecha_referencia anterior al
--      mes siguiente al consultado.
--   2. Ese ajuste define el saldo inicial y la fecha base.
--   3. Sin ajuste: saldo inicial 0 y fecha base 2020-01-01.
--   4. Se suman los ingresos y se restan los egresos desde la fecha base hasta
--      el fin del mes consultado.
--
-- La zona horaria es explícita: la versión JS usaba constructores Date en hora
-- local, lo que hacía que el resultado dependiera de la máquina.
--
-- security invoker => RLS aplica: cada quien ve solo lo suyo.

begin;

create or replace function public.saldos_por_fuente(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  fuente_id     uuid,
  nombre        text,
  tipo          text,
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
      (date_trunc('month', p_mes) + interval '1 month')::date        as mes_siguiente,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp
         at time zone p_tz)                                          as corte_ts
  ),
  ultimo_ajuste as (
    select distinct on (a.fuente_id)
      a.fuente_id,
      a.monto_ajustado,
      a.fecha_referencia
    from public.ajustes_saldos a
    cross join limites l
    where a.fecha_referencia < l.mes_siguiente
    order by a.fuente_id, a.fecha_referencia desc
  )
  select
    f.id,
    f.nombre,
    f.tipo,
    coalesce(u.monto_ajustado, 0)::numeric as saldo_inicial,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(case when t.tipo = 'ingreso' then t.monto else -t.monto end)
          from public.transacciones t
          cross join limites l2
          where t.fuente_id = f.id
            and t.fecha >= coalesce(
                  (u.fecha_referencia::timestamp at time zone p_tz),
                  ('2020-01-01 00:00:00'::timestamp at time zone p_tz)
                )
            and t.fecha < l2.corte_ts
        ), 0)
    )::numeric as saldo_actual
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.nombre;
$$;

create or replace function public.resumen_mensual(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  total_disponible numeric,
  ingresos         numeric,
  gastos           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                        as inicio_ts,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin_ts
  )
  select
    (select coalesce(sum(s.saldo_actual), 0) from public.saldos_por_fuente(p_mes, p_tz) s),
    coalesce((
      select sum(t.monto) from public.transacciones t, limites l
      where t.tipo = 'ingreso' and t.fecha >= l.inicio_ts and t.fecha < l.fin_ts
    ), 0),
    coalesce((
      select sum(t.monto) from public.transacciones t, limites l
      where t.tipo = 'egreso' and t.fecha >= l.inicio_ts and t.fecha < l.fin_ts
    ), 0);
$$;

grant execute on function public.saldos_por_fuente(date, text) to authenticated;
grant execute on function public.resumen_mensual(date, text)   to authenticated;

revoke execute on function public.saldos_por_fuente(date, text) from anon;
revoke execute on function public.resumen_mensual(date, text)   from anon;

commit;

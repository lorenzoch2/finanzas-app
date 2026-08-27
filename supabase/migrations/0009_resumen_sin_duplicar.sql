-- 0009 — Dejar de calcular los saldos dos veces por carga del dashboard
--
-- Cómo estaba: el dashboard llamaba a `saldos_por_fuente` para pintar cada
-- fuente y, por separado, a `resumen_mensual` para las tarjetas de arriba.
-- Pero `resumen_mensual` calculaba `total_disponible` llamando internamente a
-- `saldos_por_fuente` otra vez. Resultado: dos viajes de red y el cálculo
-- completo de saldos ejecutado dos veces para pintar una sola pantalla.
--
-- El arreglo: `resumen_mensual` deja de devolver `total_disponible` y se queda
-- con lo que solo ella sabe hacer (ingresos y gastos del mes, dos sumas
-- baratas). El total disponible lo suma el cliente a partir de las filas que
-- ya recibió de `saldos_por_fuente`: son tres números.
--
-- Cambiar las columnas que devuelve una función exige soltarla y recrearla;
-- CREATE OR REPLACE no permite alterar el tipo de retorno.

begin;

drop function if exists public.resumen_mensual(date, text);

create function public.resumen_mensual(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  ingresos numeric,
  gastos   numeric
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
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric
  from public.transacciones t, limites l
  where t.fecha >= l.inicio_ts
    and t.fecha <  l.fin_ts;
$$;

grant  execute on function public.resumen_mensual(date, text) to authenticated;
revoke execute on function public.resumen_mensual(date, text) from public;

commit;

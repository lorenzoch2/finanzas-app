-- =====================================================================
-- FINANZAPP — MIGRACIONES PENDIENTES (0008 y 0009)
--
-- Pega esto completo en el SQL editor de Supabase y ejecútalo una vez.
-- No repite ninguna de las migraciones que ya aplicaste.
--
--   0008  Elimina uso_productos, que quedó sin RLS y era escribible por
--         cualquiera con la anon key. Revoca EXECUTE de PUBLIC.
--   0009  resumen_mensual deja de recalcular todos los saldos para el
--         total. IMPRESCINDIBLE: el cliente ya no espera la columna
--         total_disponible, así que sin esta el dashboard falla.
-- =====================================================================


-- ============================================================
-- 0008_cerrar_huecos.sql
-- ============================================================
-- 0008 — Cerrar los huecos que dejó 0002
--
-- Dos cosas que se escaparon y que se detectaron sondeando la base ya migrada
-- con la anon key, sin sesión:
--
-- 1. `uso_productos` seguía devolviendo HTTP 200. La migración 0002 activó RLS
--    en las cinco tablas con datos y esa quedó fuera. Tiene 0 filas y la app
--    nunca la usó (existía `createUsage()` pero no había ni una llamada), así
--    que no se filtraba nada — pero era un destino de escritura abierto para
--    cualquiera que sacara la anon key del bundle, que es público por diseño.
--
-- 2. En Postgres, CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Los
--    `revoke execute ... from anon` de 0006 y 0007 no quitaban esa concesión:
--    hay que revocar de PUBLIC. El acceso ya estaba bloqueado por los permisos
--    de tabla, así que esto es una segunda línea, no la única.

begin;

-- ------------------------------------------------- uso_productos
-- Se elimina en vez de protegerse: 0 filas, ninguna lectura en el código, y
-- una tabla que nadie usa es una superficie de ataque sin contrapartida.
-- Si algún día se necesita registrar uso de productos, se crea de nuevo con
-- RLS desde el principio.
drop table if exists public.uso_productos;

-- ------------------------------------------- EXECUTE de las funciones
revoke execute on function public.saldos_por_fuente(date, text)              from public;
revoke execute on function public.resumen_mensual(date, text)                from public;
revoke execute on function public.guardar_transaccion(jsonb, jsonb, uuid)    from public;
revoke execute on function public.borrar_transaccion(uuid)                   from public;

grant execute on function public.saldos_por_fuente(date, text)               to authenticated;
grant execute on function public.resumen_mensual(date, text)                 to authenticated;
grant execute on function public.guardar_transaccion(jsonb, jsonb, uuid)     to authenticated;
grant execute on function public.borrar_transaccion(uuid)                    to authenticated;

-- --------------------------------------------------- Red de seguridad
-- Si en el futuro se crea una tabla y se olvida activarle RLS, esto lo dice
-- en voz alta al correr las migraciones en vez de dejarlo pasar en silencio.
do $$
declare
  v_sin_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into v_sin_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_sin_rls is not null then
    raise warning 'Tablas en public SIN row level security: %', v_sin_rls;
  else
    raise notice 'Todas las tablas de public tienen RLS activo.';
  end if;
end $$;

commit;


-- ============================================================
-- 0009_resumen_sin_duplicar.sql
-- ============================================================
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


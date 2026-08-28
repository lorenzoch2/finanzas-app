-- =====================================================================
-- FINANZAPP v3 - MIGRACION PENDIENTE (0019)
--
-- EJECUTALO ENTERO, DE UNA SOLA VEZ.
-- No selecciones un trozo: los bloques "do $$ ... $$" son indivisibles y
-- ejecutar medio bloque da el error "unterminated dollar-quoted string".
-- En el editor de Supabase, deja el cursor dentro sin seleccionar nada y
-- pulsa Run.
--
-- Este archivo es ASCII puro a proposito: los acentos van escapados como
-- U&'...\00F3...', que Postgres interpreta como el caracter correcto. Asi
-- da igual como se copie, aunque el portapapeles rompa el UTF-8.
--
-- ANTES: haz el respaldo. Con RLS activo necesita sesion.
--   $env:FINANZAPP_EMAIL='tu@correo.cl'
--   $env:FINANZAPP_PASSWORD='tu contrasena'
--   node scripts/backup.mjs
--
-- Es seguro volver a ejecutarlo si algo falla a medias.
--
--   0019  Los ajustes de saldo dicen POR QUE se declara el saldo.
--
-- El problema que resuelve: hay dos formas de que entre dinero al sistema y
-- solo una cuenta como ingreso. De todo lo que ha entrado, el 40% llego por
-- ajuste de saldo, invisible para el libro. Por eso el margen salia negativo
-- mes tras mes: contaba los gastos y no el dinero que los respaldaba.
--
-- Toca datos una sola vez: marca los dos ajustes existentes como ingresos que
-- no se anotaron, que es lo que eran.
--
-- IMPORTANTE: aplicalo junto con la version desplegada. resumen_periodo y
-- evolucion_mensual cambian de firma.
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla se revierte entero.
-- =====================================================================

-- ============================================================
-- 0019_ajustes_con_motivo.sql
-- ============================================================
-- 0019 - Los ajustes de saldo dicen POR QUE
--
-- El problema: en el sistema hay dos formas de que entre dinero, y solo una
-- cuenta como ingreso.
--
-- Un ajuste de saldo declara "esta cuenta tiene X" y ahi acaba. Pero de los
-- $1.952.647 que han entrado, $779.930 -el 40%- llegaron por ajuste, invisibles
-- para el libro de ingresos y gastos. Por eso el margen salia negativo mes tras
-- mes: contaba los gastos y no el dinero que los respaldaba.
--
-- Un ajuste puede tener cuatro causas, y solo dos afectan al periodo:
--
--   apertura              capital que ya existia antes de registrar. Es el
--                         punto de partida, no un ingreso de nadie.
--   ingreso_no_registrado entro plata y no se anoto. Cuenta como ingreso.
--   gasto_no_registrado   salio plata y no se anoto. Cuenta como gasto.
--   correccion            un error de tecleo. No es ni una cosa ni la otra.
--
-- Lo que hace esto util: al declarar un saldo, la DIFERENCIA entre lo
-- declarado y lo que dice el libro es exactamente lo que se quedo sin
-- registrar. Esa cifra ya existia; solo que se tragaba en silencio.

begin;

alter table public.ajustes_saldos
  add column if not exists motivo text;

-- Los dos ajustes existentes eran ingresos que no se anotaron, no aperturas:
-- ese dinero entro de verdad en junio.
update public.ajustes_saldos
set motivo = coalesce(motivo, 'ingreso_no_registrado')
where motivo is null;

alter table public.ajustes_saldos
  alter column motivo set default 'apertura',
  alter column motivo set not null;

alter table public.ajustes_saldos drop constraint if exists chk_ajuste_motivo;
alter table public.ajustes_saldos add  constraint chk_ajuste_motivo
  check (motivo in ('apertura', 'ingreso_no_registrado', 'gasto_no_registrado', 'correccion'));

-- ------------------------------------------- Lo que revela cada ajuste
-- Para cada ajuste: cuanto decia el libro justo antes, cuanto se declaro, y
-- la diferencia. Esa diferencia es el dinero sin explicar del tramo desde el
-- ajuste anterior de esa misma cuenta.
create or replace function public.brecha_de_ajustes(
  p_tz text default 'America/Santiago'
)
returns table (
  ajuste_id      uuid,
  fuente_id      uuid,
  fuente         text,
  fecha          date,
  motivo         text,
  declarado      numeric,
  segun_libro    numeric,
  brecha         numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with ordenados as (
    select
      a.id, a.fuente_id, a.fecha_referencia, a.motivo, a.monto_ajustado,
      lag(a.monto_ajustado)   over (partition by a.fuente_id order by a.fecha_referencia) as previo_monto,
      lag(a.fecha_referencia) over (partition by a.fuente_id order by a.fecha_referencia) as previo_fecha
    from public.ajustes_saldos a
  )
  select
    o.id,
    o.fuente_id,
    f.nombre,
    o.fecha_referencia,
    o.motivo,
    o.monto_ajustado,
    -- Lo que el libro tenia justo antes: el ajuste anterior de esta cuenta
    -- mas los movimientos entre ambos. Sin ajuste anterior se parte de cero,
    -- que es lo correcto para una apertura.
    (
      coalesce(o.previo_monto, 0)
      + coalesce((
          select sum(
            case
              when t.tipo = 'ingreso'                                       then  t.monto
              when t.tipo = 'egreso'                                        then -t.monto
              when t.tipo = 'transferencia' and t.fuente_id = o.fuente_id     then -t.monto
              when t.tipo = 'transferencia' and t.fuente_destino_id = o.fuente_id then t.monto
              else 0
            end
          )
          from public.transacciones t
          where (t.fuente_id = o.fuente_id or t.fuente_destino_id = o.fuente_id)
            and t.fecha >= coalesce(
                  (o.previo_fecha::timestamp at time zone p_tz),
                  ('2000-01-01 00:00:00'::timestamp at time zone p_tz)
                )
            and t.fecha < (o.fecha_referencia::timestamp at time zone p_tz)
        ), 0)
    )::numeric as segun_libro,
    (
      o.monto_ajustado - (
        coalesce(o.previo_monto, 0)
        + coalesce((
            select sum(
              case
                when t.tipo = 'ingreso'                                       then  t.monto
                when t.tipo = 'egreso'                                        then -t.monto
                when t.tipo = 'transferencia' and t.fuente_id = o.fuente_id     then -t.monto
                when t.tipo = 'transferencia' and t.fuente_destino_id = o.fuente_id then t.monto
                else 0
              end
            )
            from public.transacciones t
            where (t.fuente_id = o.fuente_id or t.fuente_destino_id = o.fuente_id)
              and t.fecha >= coalesce(
                    (o.previo_fecha::timestamp at time zone p_tz),
                    ('2000-01-01 00:00:00'::timestamp at time zone p_tz)
                  )
              and t.fecha < (o.fecha_referencia::timestamp at time zone p_tz)
          ), 0)
      )
    )::numeric as brecha
  from ordenados o
  join public.fuentes_cuentas f on f.id = o.fuente_id
  order by o.fecha_referencia, f.nombre;
$$;

-- ------------------------------------- Resumen, ahora con lo conciliado
-- Los ingresos y gastos del periodo incluyen lo que los ajustes revelaron.
-- Se devuelven por separado para que se pueda ver cuanto viene del libro y
-- cuanto de una conciliacion: no es lo mismo saber que ganaste algo que
-- deducirlo de un saldo.
drop function if exists public.resumen_periodo(date, date, text);

create function public.resumen_periodo(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (
  ingresos            numeric,
  gastos              numeric,
  ingresos_conciliados numeric,
  gastos_conciliados   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)      as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz) as fin
  ),
  libro as (
    select
      coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric as ingresos,
      coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric as gastos
    from public.transacciones t, l
    where t.fecha >= l.inicio and t.fecha < l.fin
  ),
  conciliado as (
    select
      coalesce(sum(b.brecha) filter (
        where b.motivo = 'ingreso_no_registrado' and b.brecha > 0
      ), 0)::numeric as ingresos,
      coalesce(sum(-b.brecha) filter (
        where b.motivo = 'gasto_no_registrado' and b.brecha < 0
      ), 0)::numeric as gastos
    from public.brecha_de_ajustes(p_tz) b
    where b.fecha >= p_desde and b.fecha <= p_hasta
  )
  select
    libro.ingresos + conciliado.ingresos,
    libro.gastos + conciliado.gastos,
    conciliado.ingresos,
    conciliado.gastos
  from libro, conciliado;
$$;

-- --------------------------------- Evolucion que distingue cero de vacio
-- Antes devolvia 0 para los meses sin datos, y el grafico dibujaba una linea
-- plana en cero. Eso es presentar la ausencia como un hecho: "no gastaste" y
-- "no registraste" se veian igual.
--
-- `sin_datos` permite que el grafico corte la linea donde no sabe, en vez de
-- afirmar un cero. Se deduce de los datos, asi que se corrige sola a medida
-- que se cargue el historico de 2024 y 2025.
drop function if exists public.evolucion_mensual(date, date, text);

create function public.evolucion_mensual(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (
  mes        date,
  ingresos   numeric,
  gastos     numeric,
  limite     numeric,
  sin_datos  boolean
)
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
  ),
  movimientos as (
    select
      date_trunc('month', (t.fecha at time zone p_tz))::date as mes,
      coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric as ingresos,
      coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric as gastos,
      count(*)                                                            as movimientos
    from public.transacciones t
    where t.tipo in ('ingreso', 'egreso')
    group by 1
  ),
  conciliaciones as (
    select
      date_trunc('month', b.fecha)::date as mes,
      coalesce(sum(b.brecha) filter (where b.motivo = 'ingreso_no_registrado' and b.brecha > 0), 0)::numeric as ingresos,
      coalesce(sum(-b.brecha) filter (where b.motivo = 'gasto_no_registrado' and b.brecha < 0), 0)::numeric as gastos,
      count(*) as ajustes
    from public.brecha_de_ajustes(p_tz) b
    group by 1
  )
  select
    m.mes,
    coalesce(mo.ingresos, 0) + coalesce(co.ingresos, 0),
    coalesce(mo.gastos, 0) + coalesce(co.gastos, 0),
    coalesce((
      select p.monto from public.presupuestos p
      where p.categoria_id is null
        and p.fecha_inicio <= (m.mes + interval '1 month' - interval '1 day')::date
        and p.fecha_fin    >= m.mes
        and not exists (select 1 from public.presupuesto_fuentes pf where pf.presupuesto_id = p.id)
      order by p.fecha_inicio desc limit 1
    ), 0)::numeric,
    -- Sin un solo movimiento ni ajuste, no se sabe nada de ese mes.
    (coalesce(mo.movimientos, 0) = 0 and coalesce(co.ajustes, 0) = 0)
  from meses m
  left join movimientos    mo on mo.mes = m.mes
  left join conciliaciones co on co.mes = m.mes
  order by m.mes;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'brecha_de_ajustes(text)',
    'resumen_periodo(date, date, text)',
    'evolucion_mensual(date, date, text)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
    execute format('revoke execute on function public.%s from public', f);
  end loop;
end $$;

commit;


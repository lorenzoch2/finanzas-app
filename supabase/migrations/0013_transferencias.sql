-- 0013 — Transferencias entre cuentas propias y cuenta principal
--
-- El problema: mover plata entre tus propias cuentas no es ni un ingreso ni
-- un gasto, pero hasta ahora solo existían esos dos tipos. Registrar un
-- traspaso obligaba a anotar un egreso en el origen y un ingreso en el
-- destino, con dos efectos malos:
--
--   1. Los totales del mes se inflaban por ambos lados: $200.000 movidos de
--      una cuenta a otra aparecían como $200.000 de ingreso y $200.000 de
--      gasto que nunca ocurrieron.
--   2. Nada garantizaba que las dos mitades cuadraran. Si una fallaba o se
--      editaba sola, el dinero se creaba o desaparecía.
--
-- La solución: UNA fila con origen y destino. No hay mitades que puedan
-- descuadrarse, y el resumen mensual las ignora, con lo que la referencia de
-- gasto se mantiene limpia aunque muevas plata entre cuentas.

begin;

-- --------------------------------------------------------- Cuenta principal
alter table public.fuentes_cuentas
  add column if not exists es_principal boolean not null default false;

-- Como mucho una principal. El índice parcial lo garantiza en la base, no
-- confiando en que la interfaz se acuerde de desmarcar la anterior.
create unique index if not exists uq_fuente_principal
  on public.fuentes_cuentas (user_id)
  where es_principal;

-- ------------------------------------------------------------ Transferencias
alter table public.transacciones
  add column if not exists fuente_destino_id uuid
    references public.fuentes_cuentas(id) on delete set null;

alter table public.transacciones drop constraint if exists chk_transacciones_tipo;
alter table public.transacciones add  constraint chk_transacciones_tipo
  check (tipo in ('ingreso', 'egreso', 'transferencia'));

-- Una transferencia necesita destino y no puede ir a la misma cuenta de la
-- que sale. Un ingreso o un egreso no tienen destino.
alter table public.transacciones drop constraint if exists chk_transacciones_destino;
alter table public.transacciones add  constraint chk_transacciones_destino
  check (
    case
      when tipo = 'transferencia' then
        fuente_id is not null
        and fuente_destino_id is not null
        and fuente_destino_id <> fuente_id
      else
        fuente_destino_id is null
    end
  );

create index if not exists idx_transacciones_destino
  on public.transacciones (fuente_destino_id)
  where fuente_destino_id is not null;

-- --------------------------------------------- Saldos, ahora con traspasos
-- Se conserva exactamente la regla anterior para ingresos y egresos: el
-- último ajuste anterior al cierre del mes fija el punto de partida y desde
-- ahí se acumulan los movimientos. Lo único que se añade es que una
-- transferencia resta en el origen y suma en el destino.
--
-- Como en el histórico no hay ninguna transferencia todavía, los saldos ya
-- calculados no cambian, y eso es comprobable con el golden.
--
-- Se suelta y se recrea porque cambian las columnas devueltas (se añade
-- es_principal), y CREATE OR REPLACE no permite alterar el tipo de retorno.
drop function if exists public.saldos_por_fuente(date, text);

create function public.saldos_por_fuente(
  p_mes date,
  p_tz  text default 'America/Santiago'
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
    f.es_principal,
    coalesce(u.monto_ajustado, 0)::numeric as saldo_inicial,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(
            case
              when t.tipo = 'ingreso'                          then  t.monto
              when t.tipo = 'egreso'                           then -t.monto
              when t.tipo = 'transferencia'
                   and t.fuente_id = f.id                      then -t.monto
              when t.tipo = 'transferencia'
                   and t.fuente_destino_id = f.id              then  t.monto
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
    )::numeric as saldo_actual
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.es_principal desc, f.nombre;
$$;

grant  execute on function public.saldos_por_fuente(date, text) to authenticated;
revoke execute on function public.saldos_por_fuente(date, text) from public;

-- ------------------------------------- Guardar, ahora con destino y local
create or replace function public.guardar_transaccion(
  p_transaccion jsonb,
  p_items       jsonb default '[]'::jsonb,
  p_id          uuid  default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id      uuid;
  v_usuario uuid := auth.uid();
begin
  if v_usuario is null then
    raise exception 'Sin sesión activa.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.transacciones (
      tipo, monto, fecha, fuente_id, fuente_destino_id, establecimiento_id,
      nota, monto_sin_detalle, user_id
    )
    values (
      p_transaccion ->> 'tipo',
      (p_transaccion ->> 'monto')::numeric,
      (p_transaccion ->> 'fecha')::timestamptz,
      nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      nullif(p_transaccion ->> 'fuente_destino_id', '')::uuid,
      nullif(p_transaccion ->> 'establecimiento_id', '')::uuid,
      nullif(p_transaccion ->> 'nota', ''),
      coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0),
      v_usuario
    )
    returning id into v_id;
  else
    update public.transacciones set
      tipo               = p_transaccion ->> 'tipo',
      monto              = (p_transaccion ->> 'monto')::numeric,
      fecha              = (p_transaccion ->> 'fecha')::timestamptz,
      fuente_id          = nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      fuente_destino_id  = nullif(p_transaccion ->> 'fuente_destino_id', '')::uuid,
      establecimiento_id = nullif(p_transaccion ->> 'establecimiento_id', '')::uuid,
      nota               = nullif(p_transaccion ->> 'nota', ''),
      monto_sin_detalle  = coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'La transacción % no existe o no es tuya.', p_id using errcode = '42501';
    end if;

    delete from public.items_detalle where transaccion_id = v_id;
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into public.items_detalle (
      transaccion_id, producto_id, nombre_producto, marca, categoria_id,
      unidades, cantidad_medida, precio_unitario, descuento_monto, calificacion, user_id
    )
    select
      v_id,
      nullif(item ->> 'producto_id', '')::uuid,
      nullif(item ->> 'nombre_producto', ''),
      nullif(item ->> 'marca', ''),
      nullif(item ->> 'categoria_id', '')::uuid,
      coalesce((item ->> 'unidades')::numeric, 1),
      (item ->> 'cantidad_medida')::numeric,
      (item ->> 'precio_unitario')::numeric,
      coalesce((item ->> 'descuento_monto')::numeric, 0),
      (item ->> 'calificacion')::numeric,
      v_usuario
    from jsonb_array_elements(p_items) as item;
  end if;

  return v_id;
end $$;

grant  execute on function public.guardar_transaccion(jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.guardar_transaccion(jsonb, jsonb, uuid) from public;

-- Si no hay ninguna principal, la de mayor saldo es la candidata natural.
-- Se deja marcada la primera cuenta creada, y se puede cambiar desde la app.
do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.fuentes_cuentas where es_principal) then
    select id into v_id from public.fuentes_cuentas order by created_at asc limit 1;
    if v_id is not null then
      update public.fuentes_cuentas set es_principal = true where id = v_id;
      raise notice 'Cuenta principal asignada por defecto: %', v_id;
    end if;
  end if;
end $$;

commit;

-- 0017 — Presupuestos por período y por fuente
--
-- Lo que había: un límite mensual global. Servía para «este mes no gasto más
-- de X», pero no para «entre el 1 y el 15 de diciembre, para los regalos, solo
-- puedo gastar Y con la tarjeta».
--
-- Tres cosas cambian:
--
--   1. PERÍODO LIBRE. En vez de un mes implícito, fecha de inicio y fecha de
--      fin. Un mes sigue siendo el caso normal, pero ahora es un período más,
--      no una limitación del modelo.
--
--   2. FUENTES. Un presupuesto puede aplicar a todas las cuentas o solo a
--      algunas. Sin fuentes asociadas significa «todas», que es lo que ya
--      valía y evita tener que enumerarlas para el caso habitual.
--
--   3. NOMBRE. Con varios presupuestos a la vez hay que poder distinguirlos.
--
-- Los presupuestos pueden solaparse a propósito: un tope mensual general y uno
-- acotado para un viaje son dos límites reales que conviven, y la app muestra
-- el avance de cada uno.

begin;

alter table public.presupuestos
  add column if not exists nombre        text,
  add column if not exists fecha_inicio  date,
  add column if not exists fecha_fin     date;

-- Migrar lo que hubiera: `vigente_desde` era el primer día de un mes, así que
-- el período equivalente es ese mes completo.
update public.presupuestos
set
  fecha_inicio = coalesce(fecha_inicio, vigente_desde),
  fecha_fin    = coalesce(fecha_fin, (vigente_desde + interval '1 month' - interval '1 day')::date),
  nombre       = coalesce(nombre, 'Límite de ' || to_char(vigente_desde, 'TMMonth YYYY'))
where vigente_desde is not null;

-- Para filas sin `vigente_desde` (no debería haber ninguna) se usa el mes en curso.
update public.presupuestos
set
  fecha_inicio = coalesce(fecha_inicio, date_trunc('month', current_date)::date),
  fecha_fin    = coalesce(fecha_fin, (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date),
  nombre       = coalesce(nombre, 'Límite')
where fecha_inicio is null or fecha_fin is null or nombre is null;

alter table public.presupuestos
  alter column nombre       set not null,
  alter column fecha_inicio set not null,
  alter column fecha_fin    set not null;

alter table public.presupuestos drop constraint if exists chk_presupuesto_periodo;
alter table public.presupuestos add  constraint chk_presupuesto_periodo
  check (fecha_fin >= fecha_inicio);

-- Los índices únicos anteriores asumían un límite por mes y categoría. Con
-- períodos libres y solapamiento intencionado ya no aplican.
drop index if exists public.uq_presupuesto_global;
drop index if exists public.uq_presupuesto_categoria;

-- `vigente_desde` deja de usarse. Se conserva la columna por si hiciera falta
-- reconstruir algo, pero sin obligar a rellenarla.
alter table public.presupuestos alter column vigente_desde drop not null;

create index if not exists idx_presupuestos_periodo
  on public.presupuestos (user_id, fecha_inicio, fecha_fin);

-- --------------------------------------------------- Fuentes del presupuesto
-- Sin filas para un presupuesto = aplica a todas las cuentas. Es la
-- convención que evita tener que enumerar las tres fuentes para el caso
-- normal, que es justamente «todas».
create table if not exists public.presupuesto_fuentes (
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  fuente_id      uuid not null references public.fuentes_cuentas(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (presupuesto_id, fuente_id)
);

create index if not exists idx_presupuesto_fuentes_fuente
  on public.presupuesto_fuentes (fuente_id);

alter table public.presupuesto_fuentes enable row level security;
alter table public.presupuesto_fuentes force row level security;
drop policy if exists presupuesto_fuentes_propias on public.presupuesto_fuentes;
create policy presupuesto_fuentes_propias on public.presupuesto_fuentes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.presupuesto_fuentes from anon;

-- ------------------------------------------------ Avance de los presupuestos
-- Devuelve TODOS los presupuestos que tocan la fecha de referencia, con su
-- avance. Antes devolvía un único número mensual; ahora pueden convivir
-- varios, y cada uno se mide contra su propio período y sus propias fuentes.
drop function if exists public.avance_presupuesto(date, text);

create or replace function public.avance_presupuestos(
  p_referencia date default current_date,
  p_tz         text default 'America/Santiago'
)
returns table (
  id                 uuid,
  nombre             text,
  monto              numeric,
  fecha_inicio       date,
  fecha_fin          date,
  categoria          text,
  fuentes            text,
  gastado            numeric,
  dias_transcurridos int,
  dias_totales       int,
  proyeccion         numeric,
  esta_activo        boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.nombre,
      p.monto,
      p.fecha_inicio,
      p.fecha_fin,
      c.nombre as categoria,
      p.categoria_id,
      (p.fecha_fin - p.fecha_inicio) + 1                                   as dias_totales,
      (p_referencia between p.fecha_inicio and p.fecha_fin)                as esta_activo,
      (p.fecha_inicio::timestamp at time zone p_tz)                        as inicio_ts,
      ((p.fecha_fin + 1)::timestamp at time zone p_tz)                     as fin_ts
    from public.presupuestos p
    left join public.categorias c on c.id = p.categoria_id
    where p_referencia between p.fecha_inicio and p.fecha_fin
  ),
  gasto as (
    select
      b.id,
      coalesce(sum(t.monto), 0)::numeric as gastado
    from base b
    left join public.transacciones t
      on t.tipo = 'egreso'
     and t.fecha >= b.inicio_ts
     and t.fecha <  b.fin_ts
     -- Sin fuentes asociadas, el presupuesto vale para todas las cuentas.
     and (
       not exists (select 1 from public.presupuesto_fuentes pf where pf.presupuesto_id = b.id)
       or t.fuente_id in (
            select pf.fuente_id from public.presupuesto_fuentes pf where pf.presupuesto_id = b.id
          )
     )
     -- Un presupuesto por categoría solo cuenta los ítems de esa categoría o
     -- de sus subcategorías.
     and (
       b.categoria_id is null
       or exists (
            select 1
            from public.items_detalle i
            left join public.categorias sub on sub.id = i.categoria_id
            where i.transaccion_id = t.id
              and (i.categoria_id = b.categoria_id or sub.parent_id = b.categoria_id)
          )
     )
    group by b.id
  )
  select
    b.id,
    b.nombre,
    b.monto,
    b.fecha_inicio,
    b.fecha_fin,
    b.categoria,
    coalesce((
      select string_agg(f.nombre, ', ' order by f.nombre)
      from public.presupuesto_fuentes pf
      join public.fuentes_cuentas f on f.id = pf.fuente_id
      where pf.presupuesto_id = b.id
    ), 'Todas las cuentas'),
    g.gastado,
    -- Días ya vividos del período. En uno cerrado, todos.
    case
      when p_referencia > b.fecha_fin then b.dias_totales
      when p_referencia < b.fecha_inicio then 0
      else (p_referencia - b.fecha_inicio) + 1
    end::int,
    b.dias_totales::int,
    -- La proyección solo tiene sentido mientras el período corre. En uno
    -- cerrado, lo gastado ya es definitivo.
    case
      when not b.esta_activo then g.gastado
      when (p_referencia - b.fecha_inicio) + 1 <= 0 then g.gastado
      else round(g.gastado / greatest((p_referencia - b.fecha_inicio) + 1, 1) * b.dias_totales, 0)
    end::numeric,
    b.esta_activo
  from base b
  join gasto g on g.id = b.id
  order by b.fecha_inicio desc, b.nombre;
$$;

grant  execute on function public.avance_presupuestos(date, text) to authenticated;
revoke execute on function public.avance_presupuestos(date, text) from public;

commit;

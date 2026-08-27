-- 0014 — Límite de gasto mensual
--
-- Se guarda como un MONTO FIJO, no como un porcentaje de los ingresos. Es la
-- diferencia que importa: si el límite dependiera de lo que entra, un traspaso
-- entre cuentas propias o un ingreso atípico lo subirían solo, y la referencia
-- se perdería justo el mes en que más falta hace.
--
-- Como las transferencias son su propio tipo desde 0013, no cuentan como
-- gasto ni como ingreso, así que mover plata entre tus cuentas no mueve el
-- avance del presupuesto.
--
-- Hay un límite global (categoria_id nulo) y, opcionalmente, límites por
-- categoría. El histórico se conserva: cambiar el límite en marzo no reescribe
-- lo que regía en enero, porque cada uno vale desde su fecha.

begin;

create table if not exists public.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id  uuid references public.categorias(id) on delete cascade,
  monto         numeric not null,
  vigente_desde date not null default date_trunc('month', current_date)::date,
  created_at    timestamptz not null default now(),

  constraint chk_presupuesto_monto check (monto >= 0)
);

-- Un solo límite global por fecha, y uno por categoría y fecha. Se usan dos
-- índices parciales porque un UNIQUE normal trataría cada NULL como distinto
-- y dejaría meter límites globales duplicados.
create unique index if not exists uq_presupuesto_global
  on public.presupuestos (user_id, vigente_desde)
  where categoria_id is null;

create unique index if not exists uq_presupuesto_categoria
  on public.presupuestos (user_id, categoria_id, vigente_desde)
  where categoria_id is not null;

alter table public.presupuestos enable row level security;
alter table public.presupuestos force row level security;
drop policy if exists presupuestos_propios on public.presupuestos;
create policy presupuestos_propios on public.presupuestos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.presupuestos from anon;

-- ------------------------------------------------- Avance y proyección
-- Devuelve, para un mes: cuánto se lleva gastado, cuál es el límite vigente,
-- y a qué ritmo se va.
--
-- La proyección solo tiene sentido en el mes en curso: en un mes ya cerrado
-- lo gastado ya es definitivo, así que se devuelve ese mismo número en vez de
-- una extrapolación sin sentido.
create or replace function public.avance_presupuesto(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  limite            numeric,
  gastado           numeric,
  dias_transcurridos int,
  dias_del_mes      int,
  proyeccion        numeric,
  es_mes_en_curso   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      date_trunc('month', p_mes)::date                                                as mes_inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date                         as mes_siguiente,
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                       as inicio_ts,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin_ts,
      -- «Hoy» en la zona del usuario, no en la del servidor.
      (now() at time zone p_tz)::date                                                 as hoy
    from (select 1) _
  ),
  datos as (
    select
      l.*,
      (l.mes_siguiente - l.mes_inicio)                                as dias_mes,
      (l.hoy >= l.mes_inicio and l.hoy < l.mes_siguiente)             as en_curso,
      coalesce((
        select p.monto
        from public.presupuestos p
        where p.categoria_id is null
          and p.vigente_desde <= l.mes_inicio
        order by p.vigente_desde desc
        limit 1
      ), 0) as limite,
      coalesce((
        select sum(t.monto)
        from public.transacciones t
        where t.tipo = 'egreso'
          and t.fecha >= l.inicio_ts
          and t.fecha <  l.fin_ts
      ), 0) as gastado
    from limites l
  )
  select
    d.limite,
    d.gastado,
    case when d.en_curso then greatest((d.hoy - d.mes_inicio) + 1, 1) else d.dias_mes end,
    d.dias_mes,
    case
      when not d.en_curso then d.gastado
      when (d.hoy - d.mes_inicio) + 1 <= 0 then d.gastado
      else round(d.gastado / greatest((d.hoy - d.mes_inicio) + 1, 1) * d.dias_mes, 0)
    end,
    d.en_curso
  from datos d;
$$;

grant  execute on function public.avance_presupuesto(date, text) to authenticated;
revoke execute on function public.avance_presupuesto(date, text) from public;

commit;

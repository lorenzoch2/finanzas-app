-- 0012 — Establecimientos
--
-- Registrar dónde se compró es lo que permite responder «¿dónde me sale más
-- barata la leche?». Sin esto, el catálogo de productos solo da el precio
-- histórico, pero no con qué compararlo.
--
-- Va en la transacción y no en cada ítem: una boleta es de un solo local, y
-- pedirlo producto por producto sería repetir el mismo dato veinte veces
-- mientras se está de pie en la caja.

begin;

create table if not exists public.establecimientos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  tipo       text not null default 'otro',
  created_at timestamptz not null default now(),

  constraint chk_establecimientos_tipo check (
    tipo in ('supermercado','feria','almacen','farmacia','restaurante','online','servicio','otro')
  )
);

-- Mismo criterio de identidad que en productos: evita que «Líder» y «lider»
-- acaben siendo dos locales distintos y las comparaciones no cuadren.
create unique index if not exists uq_establecimientos_nombre
  on public.establecimientos (user_id, public.normalizar_texto(nombre));

alter table public.establecimientos enable row level security;
alter table public.establecimientos force row level security;
drop policy if exists establecimientos_propios on public.establecimientos;
create policy establecimientos_propios on public.establecimientos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.establecimientos from anon;

alter table public.transacciones
  add column if not exists establecimiento_id uuid
    references public.establecimientos(id) on delete set null;

create index if not exists idx_transacciones_establecimiento
  on public.transacciones (establecimiento_id);

commit;

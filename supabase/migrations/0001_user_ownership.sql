-- 0001 — Propiedad por usuario
--
-- Añade user_id a las 5 tablas con datos, rellena las filas existentes con el
-- único usuario de auth.users y luego lo vuelve obligatorio.
--
-- REQUISITO: tu cuenta ya debe existir en auth.users (regístrate en la app
-- primero). La migración se niega a correr si hay 0 o más de 1 usuario, para
-- no adjudicarle tus datos a la cuenta equivocada.
--
-- Idempotente: se puede correr dos veces sin daño.

begin;

do $$
declare
  v_user_id uuid;
  v_count   int;
begin
  select count(*) into v_count from auth.users;

  if v_count = 0 then
    raise exception 'No hay usuarios en auth.users. Regístrate en la app antes de correr esta migración.';
  elsif v_count > 1 then
    raise exception 'Hay % usuarios en auth.users. Esta migración asume uno solo; asigna user_id a mano.', v_count;
  end if;

  select id into v_user_id from auth.users;
  raise notice 'Adjudicando los datos existentes al usuario %', v_user_id;

  -- Columna + backfill, tabla por tabla.
  alter table public.fuentes_cuentas add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.transacciones   add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.items_detalle   add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.ajustes_saldos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.categorias      add column if not exists user_id uuid references auth.users(id) on delete cascade;

  update public.fuentes_cuentas set user_id = v_user_id where user_id is null;
  update public.transacciones   set user_id = v_user_id where user_id is null;
  update public.items_detalle   set user_id = v_user_id where user_id is null;
  update public.ajustes_saldos  set user_id = v_user_id where user_id is null;
  update public.categorias      set user_id = v_user_id where user_id is null;

  -- Recién ahora es seguro exigirlo.
  alter table public.fuentes_cuentas alter column user_id set not null;
  alter table public.transacciones   alter column user_id set not null;
  alter table public.items_detalle   alter column user_id set not null;
  alter table public.ajustes_saldos  alter column user_id set not null;
  alter table public.categorias      alter column user_id set not null;

  -- Valor por defecto para inserciones futuras desde la app.
  alter table public.fuentes_cuentas alter column user_id set default auth.uid();
  alter table public.transacciones   alter column user_id set default auth.uid();
  alter table public.items_detalle   alter column user_id set default auth.uid();
  alter table public.ajustes_saldos  alter column user_id set default auth.uid();
  alter table public.categorias      alter column user_id set default auth.uid();
end $$;

create index if not exists idx_fuentes_user       on public.fuentes_cuentas (user_id);
create index if not exists idx_transacciones_user on public.transacciones   (user_id, fecha desc);
create index if not exists idx_items_user         on public.items_detalle   (user_id);
create index if not exists idx_ajustes_user       on public.ajustes_saldos  (user_id);
create index if not exists idx_categorias_user    on public.categorias      (user_id);

commit;

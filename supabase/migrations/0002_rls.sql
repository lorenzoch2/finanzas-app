-- 0002 — Row Level Security
--
-- Antes de esto, la anon key incrustada en el bundle podía leer y escribir
-- TODA la contabilidad sin iniciar sesión. Verificado empíricamente.
--
-- Después de esto, sin sesión válida las 5 tablas devuelven 0 filas.
--
-- Requiere 0001 aplicado (user_id NOT NULL en todas).

begin;

alter table public.fuentes_cuentas enable row level security;
alter table public.transacciones   enable row level security;
alter table public.items_detalle   enable row level security;
alter table public.ajustes_saldos  enable row level security;
alter table public.categorias      enable row level security;

-- Nadie puede saltarse RLS, ni siquiera el dueño de la tabla.
alter table public.fuentes_cuentas force row level security;
alter table public.transacciones   force row level security;
alter table public.items_detalle   force row level security;
alter table public.ajustes_saldos  force row level security;
alter table public.categorias      force row level security;

-- Una política por tabla que cubre SELECT/INSERT/UPDATE/DELETE.
-- `using` filtra lo que se puede ver o tocar; `with check` impide escribir
-- filas ajenas.
do $$
declare t text;
begin
  foreach t in array array[
    'fuentes_cuentas','transacciones','items_detalle','ajustes_saldos','categorias'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_propias', t);
    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, t || '_propias', t);
  end loop;
end $$;

-- El rol anónimo no tiene nada que hacer aquí.
revoke all on public.fuentes_cuentas, public.transacciones, public.items_detalle,
               public.ajustes_saldos, public.categorias
  from anon;

commit;

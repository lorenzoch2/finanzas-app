-- 0010 — Retirar triggers obsoletos de items_detalle
--
-- El fallo que lo destapó, al intentar recategorizar los ítems:
--
--   ERROR: record "new" has no field "precio_original"
--   CONTEXT: PL/pgSQL assignment
--            "NEW.precio_final := NEW.precio_original - NEW.descuento_monto"
--            PL/pgSQL function calcular_precio_final()
--
-- Qué pasó: la base traía un trigger anterior a este trabajo que calculaba
-- `precio_final` a mano en cada escritura. La migración 0004 eliminó
-- `precio_original` y convirtió `precio_final` en columna generada, pero
-- dejó el trigger vivo, apuntando a columnas que ya no existen.
--
-- Por qué no se detectó antes: el esquema solo se podía inspeccionar a
-- través de PostgREST, que expone tablas y columnas pero NO triggers. Habia
-- codigo ejecutandose en cada escritura que no era visible desde fuera. La
-- migración 0004 debió comprobar dependencias antes de soltar columnas.
--
-- Además de ser obsoleto, ese trigger ya no podría funcionar aunque las
-- columnas existieran: asignar a una columna GENERATED ALWAYS está prohibido.
--
-- Esta migración no borra un trigger concreto por su nombre, sino cualquiera
-- sobre items_detalle que toque columnas eliminadas o generadas. Si hubiera
-- más de uno, caen todos y quedan listados en el aviso.

begin;

do $$
declare
  r          record;
  v_fuente   text;
  v_borrados int := 0;
  v_lista    text := '';
begin
  for r in
    select t.tgname, p.proname, p.oid as fn_oid
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p      on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'items_detalle'
      and not t.tgisinternal
  loop
    begin
      v_fuente := pg_get_functiondef(r.fn_oid);
    exception when others then
      v_fuente := '';
    end;

    -- Columnas que ya no existen, o que ahora son generadas y por tanto no
    -- se pueden escribir desde un trigger.
    if v_fuente ~* '(precio_original|peso_volumen|precio_final|descuento_porcentaje|tuvo_descuento|total_linea)' then
      execute format('drop trigger if exists %I on public.items_detalle', r.tgname);
      v_borrados := v_borrados + 1;
      v_lista := v_lista || r.tgname || ' (' || r.proname || '), ';

      -- La función solo se suelta si no la usa ningún otro trigger.
      if not exists (
        select 1 from pg_trigger t2 where t2.tgfoid = r.fn_oid and not t2.tgisinternal
      ) then
        execute format('drop function if exists public.%I() cascade', r.proname);
      end if;
    end if;
  end loop;

  if v_borrados > 0 then
    raise notice 'Triggers obsoletos retirados: % -> %', v_borrados, rtrim(v_lista, ', ');
  else
    raise notice 'No habia triggers obsoletos en items_detalle.';
  end if;
end $$;

-- Deja constancia de lo que queda vivo, para que no vuelva a haber codigo
-- invisible ejecutandose en cada escritura.
do $$
declare
  v_restantes text;
begin
  select string_agg(c.relname || '.' || t.tgname, ', ' order by c.relname, t.tgname)
  into v_restantes
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal;

  raise notice 'Triggers activos ahora: %', coalesce(v_restantes, 'ninguno');
end $$;

commit;

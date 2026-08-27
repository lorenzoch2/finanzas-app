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

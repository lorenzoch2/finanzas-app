-- 0020 — Que las transferencias funcionen de verdad
--
-- La 0014 añadió `chk_transacciones_tipo` con los tres tipos, pero nunca quitó
-- la restricción original de la tabla, que Postgres había nombrado solo:
-- `transacciones_tipo_check`, y que únicamente admite 'ingreso' y 'egreso'.
-- Cuando dos CHECK conviven, mandan las dos: la más estricta gana siempre.
--
-- Resultado: desde la 0014 el formulario de transferencias existe, se ve y
-- parece funcionar, pero cualquier traspaso habría fallado al guardarse. No
-- saltó antes porque nunca se llegó a hacer uno. Lo destapó la importación del
-- histórico, al meter los ahorros mensuales como traspaso.
--
-- Es el mismo punto ciego que el trigger obsoleto de la 0004: PostgREST expone
-- tablas y columnas, pero no restricciones ni disparadores. Lo que no se ve por
-- la API hay que ir a buscarlo al catálogo.
--
-- Por eso esto NO borra por nombre. Busca cualquier CHECK sobre `tipo` que no
-- contemple 'transferencia' y lo retira, venga de donde venga. Y al final lo
-- comprueba de verdad: mete una transferencia y la deshace.

begin;

do $$
declare
  r record;
  v_retiradas int := 0;
  v_usuario   uuid;
  v_a         uuid;
  v_b         uuid;
begin
  select id into v_usuario from auth.users limit 1;
  if v_usuario is null then
    raise exception 'No hay usuario en auth.users.';
  end if;

  -- Cualquier CHECK que hable de `tipo` y no admita 'transferencia' sobra.
  -- Las nuestras (chk_transacciones_tipo y chk_transacciones_destino) la
  -- mencionan, así que quedan fuera de la búsqueda por su propio contenido y
  -- no por su nombre.
  for r in
    select con.conname
      from pg_constraint con
      join pg_class     c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname   = 'public'
       and c.relname   = 'transacciones'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ~ 'tipo'
       and pg_get_constraintdef(con.oid) !~ 'transferencia'
  loop
    execute format('alter table public.transacciones drop constraint %I', r.conname);
    v_retiradas := v_retiradas + 1;
    raise notice 'Restriccion obsoleta retirada: %', r.conname;
  end loop;

  if v_retiradas = 0 then
    raise notice 'No habia restricciones obsoletas sobre tipo.';
  end if;

  -- La de la 0014, por si la tabla llegó aquí sin ella.
  alter table public.transacciones drop constraint if exists chk_transacciones_tipo;
  alter table public.transacciones add  constraint chk_transacciones_tipo
    check (tipo in ('ingreso', 'egreso', 'transferencia'));

  -- --------------------------------------------------------------- La prueba
  -- Afirmar «ya está arreglado» es justo lo que falló la vez anterior. Esto lo
  -- demuestra: inserta una transferencia real y la deshace con el subbloque.
  select id into v_a from public.fuentes_cuentas where user_id = v_usuario order by created_at limit 1;
  select id into v_b from public.fuentes_cuentas where user_id = v_usuario and id <> v_a order by created_at limit 1;

  if v_a is null or v_b is null then
    raise notice 'Menos de dos cuentas: no se puede probar el traspaso.';
  else
    begin
      insert into public.transacciones (tipo, monto, fecha, fuente_id, fuente_destino_id, user_id)
      values ('transferencia', 1, now(), v_a, v_b, v_usuario);
      -- Salir por excepción deshace SOLO este subbloque, no la migración.
      raise exception using errcode = 'raise_exception', message = 'PRUEBA_OK';
    exception
      when raise_exception then
        if sqlerrm <> 'PRUEBA_OK' then
          raise;
        end if;
        raise notice 'Comprobado: una transferencia entra y se guarda.';
    end;
  end if;
end $$;

commit;

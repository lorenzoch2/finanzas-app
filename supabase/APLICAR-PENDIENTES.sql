-- =====================================================================
-- FINANZAPP v3 - MIGRACION PENDIENTE (0020)
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
--   0020  Que las transferencias funcionen de verdad.
--
-- El problema que resuelve: la 0014 anadio su restriccion de tipo, pero la
-- tabla ya traia otra puesta por Postgres al crearla, que solo admite
-- 'ingreso' y 'egreso'. Cuando dos CHECK conviven mandan las dos, asi que
-- desde entonces el formulario de transferencias se ve y parece funcionar,
-- pero cualquier traspaso falla al guardarse. Nunca salto porque no se llego
-- a hacer ninguno.
--
-- No borra por nombre: busca en el catalogo cualquier CHECK sobre el tipo que
-- no contemple 'transferencia'. Y lo comprueba de verdad, insertando una
-- transferencia y deshaciendola.
--
-- Aplicala ANTES de importar el historico: los ahorros mensuales entran como
-- traspaso y sin esto la importacion se detiene.
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla se revierte entero.
-- =====================================================================

-- ============================================================
-- 0020_transferencias_de_verdad.sql
-- ============================================================
-- 0020 - Que las transferencias funcionen de verdad
--
-- La 0014 anadio `chk_transacciones_tipo` con los tres tipos, pero nunca quito
-- la restriccion original de la tabla, que Postgres habia nombrado solo:
-- `transacciones_tipo_check`, y que unicamente admite 'ingreso' y 'egreso'.
-- Cuando dos CHECK conviven, mandan las dos: la mas estricta gana siempre.
--
-- Resultado: desde la 0014 el formulario de transferencias existe, se ve y
-- parece funcionar, pero cualquier traspaso habria fallado al guardarse. No
-- salto antes porque nunca se llego a hacer uno. Lo destapo la importacion del
-- historico, al meter los ahorros mensuales como traspaso.
--
-- Es el mismo punto ciego que el trigger obsoleto de la 0004: PostgREST expone
-- tablas y columnas, pero no restricciones ni disparadores. Lo que no se ve por
-- la API hay que ir a buscarlo al catalogo.
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
  -- mencionan, asi que quedan fuera de la busqueda por su propio contenido y
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

  -- La de la 0014, por si la tabla llego aqui sin ella.
  alter table public.transacciones drop constraint if exists chk_transacciones_tipo;
  alter table public.transacciones add  constraint chk_transacciones_tipo
    check (tipo in ('ingreso', 'egreso', 'transferencia'));

  -- --------------------------------------------------------------- La prueba
  -- Afirmar "ya esta arreglado" es justo lo que fallo la vez anterior. Esto lo
  -- demuestra: inserta una transferencia real y la deshace con el subbloque.
  select id into v_a from public.fuentes_cuentas where user_id = v_usuario order by created_at limit 1;
  select id into v_b from public.fuentes_cuentas where user_id = v_usuario and id <> v_a order by created_at limit 1;

  if v_a is null or v_b is null then
    raise notice 'Menos de dos cuentas: no se puede probar el traspaso.';
  else
    begin
      insert into public.transacciones (tipo, monto, fecha, fuente_id, fuente_destino_id, user_id)
      values ('transferencia', 1, now(), v_a, v_b, v_usuario);
      -- Salir por excepcion deshace SOLO este subbloque, no la migracion.
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


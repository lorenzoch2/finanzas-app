-- 0007 — Guardar y borrar transacciones de forma atómica
--
-- El problema que resuelve: crear una boleta eran dos requests (insertar la
-- transacción, luego sus ítems) sin nada que los uniera. Si el segundo fallaba
-- quedaba una transacción sin detalle. El código intentaba compensar borrando
-- lo insertado, pero esa compensación también podía fallar, y entonces el error
-- que se mostraba era el del rollback, no el original.
--
-- Actualizar era peor: un UPDATE por ítem, en serie, dentro de un bucle.
--
-- Aquí todo ocurre dentro de una función, o sea dentro de UNA transacción de
-- Postgres. O queda todo, o no queda nada.
--
-- En la actualización se reemplaza el detalle completo en vez de reconciliar
-- ítem por ítem: los ids de items_detalle no los referencia nadie, así que
-- rehacerlos es más simple y más seguro que emparejarlos.

begin;

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
    insert into public.transacciones (tipo, monto, fecha, fuente_id, nota, monto_sin_detalle, user_id)
    values (
      p_transaccion ->> 'tipo',
      (p_transaccion ->> 'monto')::numeric,
      (p_transaccion ->> 'fecha')::timestamptz,
      nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      nullif(p_transaccion ->> 'nota', ''),
      coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0),
      v_usuario
    )
    returning id into v_id;
  else
    update public.transacciones set
      tipo              = p_transaccion ->> 'tipo',
      monto             = (p_transaccion ->> 'monto')::numeric,
      fecha             = (p_transaccion ->> 'fecha')::timestamptz,
      fuente_id         = nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      nota              = nullif(p_transaccion ->> 'nota', ''),
      monto_sin_detalle = coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0)
    where id = p_id
    returning id into v_id;

    -- RLS ya impide tocar filas ajenas; esto distingue "no es tuya" de
    -- "no existe", que si no se confunden en un silencio.
    if v_id is null then
      raise exception 'La transacción % no existe o no es tuya.', p_id using errcode = '42501';
    end if;

    delete from public.items_detalle where transaccion_id = v_id;
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into public.items_detalle (
      transaccion_id, nombre_producto, marca, categoria_id,
      unidades, peso_volumen, precio_unitario, descuento_monto, calificacion, user_id
    )
    select
      v_id,
      nullif(item ->> 'nombre_producto', ''),
      nullif(item ->> 'marca', ''),
      nullif(item ->> 'categoria_id', '')::uuid,
      coalesce((item ->> 'unidades')::numeric, 1),
      nullif(item ->> 'peso_volumen', ''),
      (item ->> 'precio_unitario')::numeric,
      coalesce((item ->> 'descuento_monto')::numeric, 0),
      (item ->> 'calificacion')::numeric,
      v_usuario
    from jsonb_array_elements(p_items) as item;
  end if;

  return v_id;
end $$;

-- Borrar ya es atómico gracias al ON DELETE CASCADE de 0003, pero se expone
-- como función para que el cliente no tenga que saberlo.
create or replace function public.borrar_transaccion(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_borradas int;
begin
  delete from public.transacciones where id = p_id;
  get diagnostics v_borradas = row_count;

  if v_borradas = 0 then
    raise exception 'La transacción % no existe o no es tuya.', p_id using errcode = '42501';
  end if;
end $$;

grant execute on function public.guardar_transaccion(jsonb, jsonb, uuid) to authenticated;
grant execute on function public.borrar_transaccion(uuid)                to authenticated;

revoke execute on function public.guardar_transaccion(jsonb, jsonb, uuid) from anon;
revoke execute on function public.borrar_transaccion(uuid)                from anon;

commit;

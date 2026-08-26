-- 0005 — Retirar las filas fantasma "Gasto sin detalle"
--
-- Cuando el detalle de una boleta sumaba menos que el total ingresado, la app
-- inventaba un ítem llamado "Gasto sin detalle" por la diferencia y lo
-- guardaba como una fila real de items_detalle, sin categoría.
--
-- Efecto: 3 filas que no son productos contaminan cualquier análisis por
-- categoría, y no hay forma de distinguirlas de un ítem de verdad salvo por
-- su nombre.
--
-- Pasa a ser una columna de la transacción, que es donde corresponde.

begin;

alter table public.transacciones
  add column if not exists monto_sin_detalle numeric not null default 0;

-- Traslada el importe de cada fila fantasma a su transacción.
update public.transacciones t
set monto_sin_detalle = coalesce(sub.total, 0)
from (
  select transaccion_id, sum(total_linea) as total
  from public.items_detalle
  where nombre_producto = 'Gasto sin detalle'
  group by transaccion_id
) sub
where t.id = sub.transaccion_id;

do $$
declare v_borradas int;
begin
  delete from public.items_detalle where nombre_producto = 'Gasto sin detalle';
  get diagnostics v_borradas = row_count;
  raise notice 'Filas fantasma retiradas: %', v_borradas;
end $$;

alter table public.transacciones drop constraint if exists chk_transacciones_sin_detalle;
alter table public.transacciones add  constraint chk_transacciones_sin_detalle
  check (monto_sin_detalle >= 0);

commit;

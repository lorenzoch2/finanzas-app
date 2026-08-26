-- Verificación PREVIA. Solo lectura: no modifica nada.
-- Corre esto en el SQL editor de Supabase ANTES de aplicar las migraciones
-- y guarda el resultado para compararlo con post-migration.sql.

select 'fuentes_cuentas' as tabla, count(*) as filas from fuentes_cuentas
union all select 'transacciones',   count(*) from transacciones
union all select 'items_detalle',   count(*) from items_detalle
union all select 'ajustes_saldos',  count(*) from ajustes_saldos
union all select 'categorias',      count(*) from categorias
union all select 'uso_productos',   count(*) from uso_productos
order by tabla;

-- Supuestos que las migraciones dan por ciertos. Si alguno falla, PARA.
select
  count(*) filter (where precio_original is distinct from precio_unitario) as precio_original_distinto,
  count(*) filter (where nombre_producto = 'Gasto sin detalle')            as filas_fantasma,
  count(*) filter (where tuvo_descuento)                                    as marcadas_con_descuento,
  count(*) filter (where coalesce(descuento_porcentaje,0) > 0
                      or coalesce(descuento_monto,0) > 0)                   as con_descuento_real
from items_detalle;
-- Esperado: precio_original_distinto = 0, filas_fantasma = 3,
--           marcadas_con_descuento = 0, con_descuento_real = 9

select count(*) as transacciones_sin_fuente from transacciones where fuente_id is null;
-- Esperado: 1

select count(*) as usuarios_en_auth from auth.users;
-- Debe ser exactamente 1 antes de correr 0001. Si es 0, crea tu cuenta primero.

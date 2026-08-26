-- Verificación POSTERIOR. Solo lectura.
-- Corre esto con tu sesión iniciada, después de aplicar 0001-0006.

-- 1) Conteos. Esperado: 3 / 91 / 93 / 2 / 17
--    items_detalle baja de 96 a 93 porque salieron las 3 filas fantasma.
select 'fuentes_cuentas' as tabla, count(*) as filas from fuentes_cuentas
union all select 'transacciones',  count(*) from transacciones
union all select 'items_detalle',  count(*) from items_detalle
union all select 'ajustes_saldos', count(*) from ajustes_saldos
union all select 'categorias',     count(*) from categorias
order by tabla;

-- 2) Nada quedó sin dueño. Esperado: 0 en todas.
select 'fuentes_cuentas' as tabla, count(*) as sin_dueno from fuentes_cuentas where user_id is null
union all select 'transacciones',  count(*) from transacciones  where user_id is null
union all select 'items_detalle',  count(*) from items_detalle  where user_id is null
union all select 'ajustes_saldos', count(*) from ajustes_saldos where user_id is null
union all select 'categorias',     count(*) from categorias     where user_id is null;

-- 3) RLS activo y forzado en las 5 tablas. Esperado: rls=true, forzado=true.
select relname as tabla, relrowsecurity as rls, relforcerowsecurity as forzado
from pg_class
where relname in ('fuentes_cuentas','transacciones','items_detalle','ajustes_saldos','categorias')
order by relname;

-- 4) Las columnas derivadas son realmente generadas. Esperado: ALWAYS en las 4.
select column_name, is_generated, generation_expression
from information_schema.columns
where table_name = 'items_detalle'
  and column_name in ('precio_final','descuento_porcentaje','tuvo_descuento','total_linea')
order by column_name;

-- 5) tuvo_descuento dejó de mentir. Esperado: 9.
select count(*) filter (where tuvo_descuento) as con_descuento from items_detalle;

-- 6) precio_original ya no existe. Esperado: 0 filas.
select column_name from information_schema.columns
where table_name = 'items_detalle' and column_name = 'precio_original';

-- 7) Los saldos deben coincidir con el golden capturado antes de migrar.
--    Compara contra backups/<stamp>/golden-saldos.json
select * from saldos_por_fuente(date_trunc('month', current_date)::date);
select * from resumen_mensual(date_trunc('month', current_date)::date);

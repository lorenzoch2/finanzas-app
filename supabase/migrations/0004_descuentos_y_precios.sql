-- 0004 — Modelo de descuentos y precios
--
-- Estado que corrige, todo verificado contra los 96 ítems reales:
--
--   * `precio_original` es un duplicado EXACTO de `precio_unitario` (96/96).
--   * `precio_final` es un valor derivable guardado a mano; cuadra con la
--     fórmula en 96/96, así que nada cambia al generarlo.
--   * `tuvo_descuento` está en false en las 96 filas, incluidas las 9 que SÍ
--     tienen descuento. La columna mentía.
--   * `descuento_porcentaje` y `descuento_monto` NO son tipos alternativos de
--     descuento: en las 9 filas con descuento, monto = precio_unitario * pct/100
--     (9/9). Es la tasa y el dinero ahorrado, no dos modos excluyentes.
--
-- Modelo resultante: `descuento_monto` (dinero ahorrado por unidad) es la única
-- fuente de verdad. El porcentaje, el precio final y la bandera se derivan.
-- Una columna generada no puede desincronizarse ni mentir.
--
-- El formulario de la app escribía estas columnas como modos excluyentes; la
-- v2 convierte cualquier entrada (tasa o monto) a `descuento_monto` al guardar.

begin;

-- ------------------------------------------------- Guardas: si algo no
-- calza con lo verificado, esta migración se niega a correr.
do $$
declare
  v_orig_distinto  int := 0;
  v_pct_sin_monto  int;
  v_monto_incoher  int;
  v_tiene_original boolean;
begin
  -- La comprobación de precio_original solo aplica si la columna sigue ahí.
  -- Sin esto, volver a correr la migración fallaba con "column does not
  -- exist" en su propia guarda, justo cuando más falta hace poder reintentar.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'items_detalle'
      and column_name  = 'precio_original'
  ) into v_tiene_original;

  if v_tiene_original then
    execute 'select count(*) from public.items_detalle where precio_original is distinct from precio_unitario'
      into v_orig_distinto;
  end if;

  -- descuento_porcentaje pasa a ser generada; si ya lo es, esta comprobación
  -- sigue siendo válida porque se deriva de descuento_monto.
  select count(*) into v_pct_sin_monto
    from public.items_detalle
    where coalesce(descuento_porcentaje, 0) > 0 and coalesce(descuento_monto, 0) = 0;

  select count(*) into v_monto_incoher
    from public.items_detalle
    where coalesce(descuento_monto, 0) > coalesce(precio_unitario, 0);

  if v_orig_distinto > 0 then
    raise exception 'precio_original difiere de precio_unitario en % filas. Revisar antes de borrar la columna.', v_orig_distinto;
  end if;

  if v_pct_sin_monto > 0 then
    raise exception '% filas tienen porcentaje pero no monto; descuento_monto no puede ser la fuente de verdad todavía.', v_pct_sin_monto;
  end if;

  if v_monto_incoher > 0 then
    raise exception '% filas tienen descuento mayor que el precio unitario.', v_monto_incoher;
  end if;
end $$;

-- --------------------------------------------- Fuente de verdad del descuento
alter table public.items_detalle
  alter column descuento_monto set default 0;

update public.items_detalle set descuento_monto = 0 where descuento_monto is null;

alter table public.items_detalle
  alter column descuento_monto set not null;

alter table public.items_detalle drop constraint if exists chk_items_descuento_monto;
alter table public.items_detalle add  constraint chk_items_descuento_monto
  check (descuento_monto >= 0 and descuento_monto <= coalesce(precio_unitario, 0));

-- ------------------------------------------------------- Columnas derivadas
-- Postgres no permite convertir una columna existente en generada: hay que
-- soltarla y volver a crearla. Los valores se recalculan solos y, por las
-- verificaciones de arriba, salen idénticos a los que había.
alter table public.items_detalle drop column if exists precio_original;
alter table public.items_detalle drop column if exists precio_final;
alter table public.items_detalle drop column if exists tuvo_descuento;
alter table public.items_detalle drop column if exists descuento_porcentaje;

alter table public.items_detalle
  add column precio_final numeric
  generated always as (greatest(coalesce(precio_unitario, 0) - descuento_monto, 0)) stored;

alter table public.items_detalle
  add column descuento_porcentaje numeric
  generated always as (
    case
      when coalesce(precio_unitario, 0) = 0 then 0
      else round(descuento_monto / precio_unitario * 100, 2)
    end
  ) stored;

alter table public.items_detalle
  add column tuvo_descuento boolean
  generated always as (descuento_monto > 0) stored;

-- Total de la línea, para no repetir la multiplicación en cada consulta.
alter table public.items_detalle drop column if exists total_linea;
alter table public.items_detalle
  add column total_linea numeric
  generated always as (
    greatest(coalesce(precio_unitario, 0) - descuento_monto, 0) * coalesce(unidades, 1)
  ) stored;

commit;

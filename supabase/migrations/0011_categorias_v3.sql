-- 0011 — Taxonomía de categorías v3
--
-- GENERADO por scripts/generar-migracion-categorias.mjs desde
-- scripts/taxonomia.mjs. No editar a mano: regenerar.
--
-- Por qué se rehace la taxonomía:
--
--   * De las 17 categorías anteriores, 7 no se usaron nunca.
--   * «Alimentación» acumulaba 40 ítems mezclando compra de supermercado,
--     comida al paso, snacks, bebidas y suplementos deportivos. Con todo en
--     el mismo saco no se podía analizar nada.
--   * 27 ítems (29%) estaban sin categoría porque no existía ninguna donde
--     pusieran encajar: menaje, muebles, ferretería.
--   * Un mismo tipo de gasto se clasificaba distinto según el día: «Pizza» y
--     «Café» aparecían a la vez en «Alimentación» y en «Restaurantes».
--
-- Resultado: 51 categorías (10 principales) y los 72 productos
-- históricos mapeados uno por uno. Ningún ítem queda sin clasificar.
--
-- Reversible: el backup previo permite reconstruir el estado anterior.

begin;

-- ------------------------------------------- Apartar las categorías viejas
-- La taxonomía nueva reutiliza nombres que ya existen: Transporte, Educación,
-- Regalos, Viajes, Arriendo e Imprevistos. Como `categorias` no tiene
-- restricción de unicidad por nombre, buscar la categoría padre por su nombre
-- podría encontrar la ANTIGUA y colgar las subcategorías del sitio
-- equivocado, en silencio.
--
-- Renombrarlas antes elimina la ambigüedad. Al final del archivo se borran.
update public.categorias
set nombre = nombre || ' (antigua)'
where parent_id is null
  and nombre in (
    'Ahorro','Alimentación','Arriendo','Compras personales','Educación','Entretenimiento',
    'Higiene','Imprevistos','Internet/Telefonía','Regalos','Restaurantes/Comida Rápida',
    'Ropa','Salud','Servicios básicos','Suscripciones','Transporte','Viajes'
  );

-- ------------------------------------------------------- Taxonomía nueva
-- Se insertan primero las principales y luego las hijas, que necesitan el id
-- de su padre. El trigger anti-ciclos de 0003 sigue vigilando.
do $$
declare
  v_usuario uuid;
  r         record;
  v_padre   uuid;
begin
  select id into v_usuario from auth.users limit 1;
  if v_usuario is null then
    raise exception 'No hay usuario en auth.users.';
  end if;

  create temporary table tmp_taxonomia (nombre text, padre text) on commit drop;
  insert into tmp_taxonomia (nombre, padre) values
    ('Supermercado y despensa', null),
    ('Frutas y verduras', 'Supermercado y despensa'),
    ('Carnes y pescados', 'Supermercado y despensa'),
    ('Lácteos y huevos', 'Supermercado y despensa'),
    ('Panadería', 'Supermercado y despensa'),
    ('Abarrotes', 'Supermercado y despensa'),
    ('Café e infusiones', 'Supermercado y despensa'),
    ('Snacks y dulces', 'Supermercado y despensa'),
    ('Bebidas', 'Supermercado y despensa'),
    ('Feria', 'Supermercado y despensa'),
    ('Comer fuera', null),
    ('Comida rápida', 'Comer fuera'),
    ('Restaurante', 'Comer fuera'),
    ('Cafetería', 'Comer fuera'),
    ('Delivery', 'Comer fuera'),
    ('Alcohol', null),
    ('Para la casa', 'Alcohol'),
    ('Salidas y bares', 'Alcohol'),
    ('Hogar', null),
    ('Aseo y limpieza', 'Hogar'),
    ('Menaje y cocina', 'Hogar'),
    ('Muebles', 'Hogar'),
    ('Ferretería', 'Hogar'),
    ('Salud y cuidado personal', null),
    ('Higiene personal', 'Salud y cuidado personal'),
    ('Farmacia', 'Salud y cuidado personal'),
    ('Consultas y exámenes', 'Salud y cuidado personal'),
    ('Deporte y suplementos', 'Salud y cuidado personal'),
    ('Cuentas y servicios', null),
    ('Luz, agua y gas', 'Cuentas y servicios'),
    ('Gastos comunes', 'Cuentas y servicios'),
    ('Internet y telefonía', 'Cuentas y servicios'),
    ('Arriendo', 'Cuentas y servicios'),
    ('Suscripciones digitales', null),
    ('Streaming', 'Suscripciones digitales'),
    ('Herramientas y software', 'Suscripciones digitales'),
    ('Transporte', null),
    ('Combustible', 'Transporte'),
    ('Transporte público', 'Transporte'),
    ('Apps de movilidad', 'Transporte'),
    ('Vehículo', 'Transporte'),
    ('Compras personales', null),
    ('Ropa y calzado', 'Compras personales'),
    ('Tecnología', 'Compras personales'),
    ('Entretenimiento', 'Compras personales'),
    ('Regalos', 'Compras personales'),
    ('Otros', null),
    ('Educación', 'Otros'),
    ('Viajes', 'Otros'),
    ('Imprevistos', 'Otros'),
    ('Préstamos a terceros', 'Otros');

  -- Principales
  for r in select nombre from tmp_taxonomia where padre is null loop
    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, null, v_usuario);
  end loop;

  -- Subcategorías
  for r in select nombre, padre from tmp_taxonomia where padre is not null loop
    select id into v_padre
      from public.categorias
      where nombre = r.padre and parent_id is null and user_id = v_usuario;

    if v_padre is null then
      raise exception 'No se encontró la categoría padre %', r.padre;
    end if;

    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, v_padre, v_usuario);
  end loop;
end $$;

-- --------------------------------------------------- Remapeo de los ítems
do $$
declare
  v_usuario   uuid;
  v_sin_mapa  int;
  v_migrados  int;
begin
  select id into v_usuario from auth.users limit 1;

  create temporary table tmp_mapeo (producto text, subcategoria text) on commit drop;
  insert into tmp_mapeo (producto, subcategoria) values
    ('Acondicionador Rosa Mosqueta', 'Higiene personal'),
    ('Alfajor', 'Snacks y dulces'),
    ('Arroz', 'Abarrotes'),
    ('Atún agua', 'Carnes y pescados'),
    ('Bebida', 'Cafetería'),
    ('Bolsas de basura', 'Aseo y limpieza'),
    ('Café', 'Café e infusiones'),
    ('Café Descafeinado', 'Café e infusiones'),
    ('Cepillo interdental', 'Higiene personal'),
    ('Cerveza', 'Para la casa'),
    ('Champiñon', 'Frutas y verduras'),
    ('Chancaca', 'Abarrotes'),
    ('Chocolate', 'Snacks y dulces'),
    ('Chocolate de leche', 'Snacks y dulces'),
    ('Colación Pollo Asado', 'Comida rápida'),
    ('Completo', 'Comida rápida'),
    ('Confort', 'Aseo y limpieza'),
    ('Creatina Monohidratada', 'Deporte y suplementos'),
    ('Datos Móviles', 'Internet y telefonía'),
    ('Electromechanics', 'Educación'),
    ('Enjuague bucal', 'Higiene personal'),
    ('Entel Hogar', 'Internet y telefonía'),
    ('Enter Movil', 'Internet y telefonía'),
    ('Escritorio Home Studio', 'Muebles'),
    ('Escurridor', 'Menaje y cocina'),
    ('Feria', 'Feria'),
    ('Fideo Huevo', 'Abarrotes'),
    ('Gatorade', 'Bebidas'),
    ('GGCC', 'Gastos comunes'),
    ('Hallulla', 'Panadería'),
    ('Huevos', 'Lácteos y huevos'),
    ('Leche Entera', 'Lácteos y huevos'),
    ('Lechuga', 'Frutas y verduras'),
    ('Lechuga Costina Corazón', 'Frutas y verduras'),
    ('Lomo Centro', 'Carnes y pescados'),
    ('Luz', 'Luz, agua y gas'),
    ('Mendocino', 'Snacks y dulces'),
    ('Mesa Comedor', 'Muebles'),
    ('Netlify', 'Herramientas y software'),
    ('Nuez', 'Abarrotes'),
    ('Pack Salsa Tomate', 'Abarrotes'),
    ('Pan', 'Panadería'),
    ('Pan dobladas', 'Panadería'),
    ('Pana pollo', 'Carnes y pescados'),
    ('Papel higiénico', 'Aseo y limpieza'),
    ('Papelero baño', 'Menaje y cocina'),
    ('Paté de Ternera', 'Carnes y pescados'),
    ('Pechuga pollo', 'Carnes y pescados'),
    ('Pechuga Pollo', 'Carnes y pescados'),
    ('Pesas tobilleras', 'Deporte y suplementos'),
    ('Piscola', 'Para la casa'),
    ('Pizza', 'Comida rápida'),
    ('Préstamo papá', 'Préstamos a terceros'),
    ('Queque', 'Cafetería'),
    ('Queso chanco', 'Lácteos y huevos'),
    ('Red', 'Transporte público'),
    ('Remedios', 'Farmacia'),
    ('Sandwich', 'Comida rápida'),
    ('Servilleta', 'Aseo y limpieza'),
    ('Soldadura', 'Ferretería'),
    ('Sopaipilla', 'Panadería'),
    ('Subway', 'Comida rápida'),
    ('Suerox', 'Bebidas'),
    ('Tapa olla', 'Menaje y cocina'),
    ('Tendedero', 'Menaje y cocina'),
    ('Toalla húmeda', 'Aseo y limpieza'),
    ('Toalla Nova', 'Aseo y limpieza'),
    ('Trutro pollo', 'Carnes y pescados'),
    ('Twix', 'Snacks y dulces'),
    ('Verdulero', 'Menaje y cocina'),
    ('Wifi', 'Internet y telefonía'),
    ('Youtube', 'Streaming');

  update public.items_detalle i
  set categoria_id = c.id
  from tmp_mapeo m
  join public.categorias c
    on c.nombre = m.subcategoria
   and c.parent_id is not null
   and c.user_id = v_usuario
  where i.nombre_producto = m.producto;

  get diagnostics v_migrados = row_count;
  raise notice 'Ítems recategorizados: %', v_migrados;

  -- Nada puede quedarse atrás sin que se note.
  select count(*) into v_sin_mapa
  from public.items_detalle i
  where i.categoria_id is null;

  if v_sin_mapa > 0 then
    raise warning '% ítems quedaron sin categoría. Revisa scripts/taxonomia.mjs.', v_sin_mapa;
  else
    raise notice 'Todos los ítems tienen categoría.';
  end if;
end $$;

-- ------------------------------------------------- Retirar las antiguas
-- Se reconocen por el sufijo que se les puso al principio, no por su nombre
-- original: así no hay forma de borrar por error una categoría nueva que se
-- llame igual.
--
-- Solo se van las que ya no usa nadie. Si alguna conservara ítems, se queda y
-- se avisa, en vez de arrastrarlos en silencio.
do $$
declare
  v_borradas int;
  v_en_uso   text;
begin
  select string_agg(distinct c.nombre, ', ')
  into v_en_uso
  from public.categorias c
  join public.items_detalle i on i.categoria_id = c.id
  where c.nombre like '%(antigua)';

  if v_en_uso is not null then
    raise warning 'Categorías antiguas todavía con ítems, no se borran: %', v_en_uso;
  end if;

  delete from public.categorias c
  where c.nombre like '%(antigua)'
    and not exists (select 1 from public.categorias h where h.parent_id = c.id)
    and not exists (select 1 from public.items_detalle i where i.categoria_id = c.id);
  -- No se comprueba `productos`: esa tabla nace en 0012, después de esta.

  get diagnostics v_borradas = row_count;
  raise notice 'Categorías antiguas retiradas: %', v_borradas;
end $$;

commit;

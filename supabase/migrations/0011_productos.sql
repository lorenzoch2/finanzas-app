-- 0011 — Catálogo de productos y unidades estructuradas
--
-- GENERADO por scripts/generar-migracion-productos.mjs. No editar a mano.
--
-- Dos problemas que resuelve:
--
-- 1. IDENTIDAD DE PRODUCTO. El nombre era texto libre y ya se estaba
--    duplicando: «Colún» y «Colun», «Pechuga Pollo» y «Pechuga pollo». Sin
--    identidad estable no se puede comparar el mismo producto entre
--    establecimientos ni seguir su precio en el tiempo, que es justo para lo
--    que se quiere el catálogo.
--
-- 2. `peso_volumen` MEZCLABA TRES COSAS en un texto libre con 17 formatos:
--
--      contenido del envase   170 g café, 250 g chocolate, 30 huevos, 4 rollos
--                             -> va en el producto: no cambia entre compras
--
--      peso variable          0,674 kg de hallulla, 0,546 kg de pan
--                             -> va en la compra: cambia cada vez
--
--      atributo del objeto    tapa de olla de 14 cm frente a una de 24 cm
--                             -> pasa al nombre: son productos distintos
--
--    El mismo texto significaba cosas distintas según el producto («4 kg» en
--    unas pesas es el peso del objeto; «250 g» en un chocolate es contenido),
--    así que la interpretación se decidió caso por caso, no con una regla
--    automática.
--
-- Resultado: 75 productos, 12 con contenido medible y 2 vendidos a granel.

begin;

-- Normalización estable para comparar nombres. Sin extensión unaccent:
-- translate() basta para el español y es inmutable, que es lo que exige un
-- índice único.
create or replace function public.normalizar_texto(t text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(trim(regexp_replace(
    translate(
      t,
      'áàäâãéèëêíìïîóòöôõúùüûñÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑ',
      'aaaaaeeeeiiiiooooouuuunAAAAAEEEEIIIIOOOOOUUUUN'
    ),
    '\s+', ' ', 'g')))
$$;

create table if not exists public.productos (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre              text not null,
  marca               text,
  categoria_id        uuid references public.categorias(id) on delete set null,
  contenido_cantidad  numeric,
  contenido_unidad    text,
  vendido_por         text not null default 'unidad',
  created_at          timestamptz not null default now(),

  constraint chk_productos_unidad
    check (contenido_unidad is null or contenido_unidad in ('g','kg','ml','l','unidad')),
  constraint chk_productos_vendido
    check (vendido_por in ('unidad','peso')),
  constraint chk_productos_contenido
    check (contenido_cantidad is null or contenido_cantidad > 0)
);

-- Lo que impide que vuelvan a existir dos «Leche Entera Colún» distintos.
create unique index if not exists uq_productos_identidad
  on public.productos (
    user_id,
    public.normalizar_texto(nombre),
    coalesce(public.normalizar_texto(marca), ''),
    coalesce(contenido_cantidad, -1),
    coalesce(contenido_unidad, '')
  );

create index if not exists idx_productos_categoria on public.productos (categoria_id);

alter table public.productos enable row level security;
alter table public.productos force row level security;
drop policy if exists productos_propios on public.productos;
create policy productos_propios on public.productos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.productos from anon;

-- El peso real de una compra a granel: cambia en cada compra, así que vive
-- en el ítem y no en el producto.
alter table public.items_detalle
  add column if not exists producto_id uuid references public.productos(id) on delete set null,
  add column if not exists cantidad_medida numeric;

create index if not exists idx_items_producto on public.items_detalle (producto_id);

-- ------------------------------------------------------------ Backfill
do $$
declare
  v_usuario uuid;
  v_creados int;
  v_ligados int;
  v_huerfanos int;
begin
  select id into v_usuario from auth.users limit 1;
  if v_usuario is null then
    raise exception 'No hay usuario en auth.users.';
  end if;

  create temporary table tmp_productos (
    nombre text, marca text, subcategoria text,
    contenido_cantidad numeric, contenido_unidad text, vendido_por text
  ) on commit drop;

  insert into tmp_productos values
    ('Red', null, 'Transporte público', null, null, 'unidad'),
    ('Colación Pollo Asado', 'Polloteka', 'Comida rápida', null, null, 'unidad'),
    ('Gatorade', null, 'Bebidas', null, null, 'unidad'),
    ('Twix', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Piscola', null, 'Para la casa', null, null, 'unidad'),
    ('Préstamo papá', null, 'Préstamos a terceros', null, null, 'unidad'),
    ('Sandwich 15 cm', 'Subway', 'Comida rápida', null, null, 'unidad'),
    ('Café', 'Nescafé', 'Café e infusiones', null, null, 'unidad'),
    ('Datos Móviles', 'Entel', 'Internet y telefonía', null, null, 'unidad'),
    ('Wifi', 'Entel', 'Internet y telefonía', null, null, 'unidad'),
    ('Café Descafeinado', 'Gold', 'Café e infusiones', 170, 'g', 'unidad'),
    ('Nuez', null, 'Abarrotes', 1, 'kg', 'unidad'),
    ('Pesas tobilleras 4 kg', 'Fitnics', 'Deporte y suplementos', null, null, 'unidad'),
    ('Youtube', null, 'Streaming', null, null, 'unidad'),
    ('Pizza', null, 'Comida rápida', null, null, 'unidad'),
    ('Cerveza', 'Heineken', 'Para la casa', null, null, 'unidad'),
    ('Piscola', 'Alto del Carmen', 'Para la casa', null, null, 'unidad'),
    ('Suerox', null, 'Bebidas', null, null, 'unidad'),
    ('Toalla húmeda', null, 'Aseo y limpieza', null, null, 'unidad'),
    ('Café', null, 'Café e infusiones', null, null, 'unidad'),
    ('Completo', null, 'Comida rápida', null, null, 'unidad'),
    ('Electromechanics', null, 'Educación', null, null, 'unidad'),
    ('Subway', null, 'Comida rápida', null, null, 'unidad'),
    ('Lechuga Costina Corazón', null, 'Frutas y verduras', 3, 'unidad', 'unidad'),
    ('Pack Salsa Tomate', null, 'Abarrotes', null, null, 'unidad'),
    ('Fideo Huevo', null, 'Abarrotes', null, null, 'unidad'),
    ('Escritorio Home Studio', null, 'Muebles', null, null, 'unidad'),
    ('Mesa Comedor', null, 'Muebles', null, null, 'unidad'),
    ('Bebida', null, 'Cafetería', null, null, 'unidad'),
    ('Queque', null, 'Cafetería', null, null, 'unidad'),
    ('Servilleta', 'Elite', 'Aseo y limpieza', null, null, 'unidad'),
    ('Leche Entera', 'Colún', 'Lácteos y huevos', null, null, 'unidad'),
    ('Chocolate', 'Sahne Nuss', 'Snacks y dulces', 250, 'g', 'unidad'),
    ('Hallulla', null, 'Panadería', null, null, 'peso'),
    ('Papel higiénico', 'Elite', 'Aseo y limpieza', 4, 'unidad', 'unidad'),
    ('Toalla Nova', 'Nova', 'Aseo y limpieza', 2, 'unidad', 'unidad'),
    ('Lomo Centro', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Pechuga Pollo', 'Ariztía', 'Carnes y pescados', 500, 'g', 'unidad'),
    ('Soldadura', null, 'Ferretería', 1, 'kg', 'unidad'),
    ('Tapa olla 14 cm', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Tapa olla 24 cm', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Escurridor', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Papelero baño', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Tendedero', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Verdulero', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Huevos', null, 'Lácteos y huevos', 30, 'unidad', 'unidad'),
    ('Luz', null, 'Luz, agua y gas', null, null, 'unidad'),
    ('Enter Movil', null, 'Internet y telefonía', null, null, 'unidad'),
    ('Entel Hogar', null, 'Internet y telefonía', null, null, 'unidad'),
    ('Feria', null, 'Feria', null, null, 'unidad'),
    ('Arroz', null, 'Abarrotes', null, null, 'unidad'),
    ('Paté de Ternera', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Pan dobladas', null, 'Panadería', null, null, 'peso'),
    ('Chancaca', null, 'Abarrotes', null, null, 'unidad'),
    ('Sopaipilla', null, 'Panadería', null, null, 'unidad'),
    ('Alfajor', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Remedios', null, 'Farmacia', null, null, 'unidad'),
    ('Creatina Monohidratada', null, 'Deporte y suplementos', 300, 'g', 'unidad'),
    ('Cepillo interdental', null, 'Higiene personal', null, null, 'unidad'),
    ('Acondicionador Rosa Mosqueta', null, 'Higiene personal', null, null, 'unidad'),
    ('Enjuague bucal', null, 'Higiene personal', null, null, 'unidad'),
    ('Confort', 'Elite', 'Aseo y limpieza', 4, 'unidad', 'unidad'),
    ('Pana pollo', 'Ariztía', 'Carnes y pescados', null, null, 'unidad'),
    ('Pechuga pollo', 'Ariztía', 'Carnes y pescados', 480, 'g', 'unidad'),
    ('Atún agua', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Netlify', null, 'Herramientas y software', null, null, 'unidad'),
    ('Pan', null, 'Panadería', null, null, 'unidad'),
    ('Bolsas de basura', null, 'Aseo y limpieza', null, null, 'unidad'),
    ('GGCC', null, 'Gastos comunes', null, null, 'unidad'),
    ('Mendocino', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Lechuga', null, 'Frutas y verduras', null, null, 'unidad'),
    ('Chocolate de leche', 'Costanuss', 'Snacks y dulces', null, null, 'unidad'),
    ('Queso chanco', null, 'Lácteos y huevos', null, null, 'unidad'),
    ('Champiñon', null, 'Frutas y verduras', null, null, 'unidad'),
    ('Trutro pollo', null, 'Carnes y pescados', null, null, 'unidad');

  insert into public.productos
    (nombre, marca, categoria_id, contenido_cantidad, contenido_unidad, vendido_por, user_id)
  select
    t.nombre, t.marca,
    (select c.id from public.categorias c
      where c.nombre = t.subcategoria and c.parent_id is not null and c.user_id = v_usuario
      limit 1),
    t.contenido_cantidad, t.contenido_unidad, t.vendido_por, v_usuario
  from tmp_productos t
  on conflict do nothing;

  get diagnostics v_creados = row_count;
  raise notice 'Productos creados: %', v_creados;

  -- Vincular cada ítem con su producto y guardar el peso real si era granel.
  create temporary table tmp_vinculo (
    item_id uuid, nombre text, marca text, cantidad_medida numeric
  ) on commit drop;

  insert into tmp_vinculo values
    ('236f2157-c3f6-4448-9d4e-b9fa80805aa7'::uuid, 'Red', null, null),
    ('5f714285-c6c4-42b1-8e90-2400a8ae1fd8'::uuid, 'Colación Pollo Asado', 'Polloteka', null),
    ('61b9a007-23c5-48fb-831a-facd0de4ad40'::uuid, 'Gatorade', null, null),
    ('c0eadb4e-e9a1-4ad9-a4f4-dcb419bfb55c'::uuid, 'Twix', null, null),
    ('f198a5aa-5e9e-4617-9fe8-ed5c83b23c70'::uuid, 'Piscola', null, null),
    ('f13d9975-8cc7-4177-b25c-d97497f98597'::uuid, 'Piscola', null, null),
    ('0aeabcf3-8763-4469-b24d-285f2a3b3088'::uuid, 'Préstamo papá', null, null),
    ('849e9b16-3131-49f2-a3e6-1a90e3449ea8'::uuid, 'Sandwich 15 cm', 'Subway', null),
    ('84fa20fb-e168-48c8-be96-74e1d0dbdf58'::uuid, 'Café', 'Nescafé', null),
    ('5bf16aa9-0316-46ed-8726-a583277af8d3'::uuid, 'Datos Móviles', 'Entel', null),
    ('487aabaa-ca38-482d-89d8-d466b9d53cf1'::uuid, 'Wifi', 'Entel', null),
    ('5b6ff102-08ae-4ee7-9ff6-a6fb2221fc86'::uuid, 'Café Descafeinado', 'Gold', null),
    ('9163f0f1-0157-46a0-aee7-4031639e0eb6'::uuid, 'Nuez', null, null),
    ('4300402b-6152-4b4b-b439-fb251c95d7b9'::uuid, 'Pesas tobilleras 4 kg', 'Fitnics', null),
    ('c08feee5-c2da-41e3-9299-c066f5abfa42'::uuid, 'Youtube', null, null),
    ('d94b02b9-18ff-4a9f-9965-c8ebe04ab644'::uuid, 'Pizza', null, null),
    ('06914513-1a8c-4876-b0f8-b35049a3eaa1'::uuid, 'Pizza', null, null),
    ('dc8a4813-756a-439f-80ad-d53c6429777f'::uuid, 'Cerveza', 'Heineken', null),
    ('7b130831-c7fa-4512-88f9-2b02eb79fff8'::uuid, 'Piscola', 'Alto del Carmen', null),
    ('2c766d01-318b-42a8-b139-7e6877bb0f63'::uuid, 'Suerox', null, null),
    ('892bdb7a-1a10-40f1-8e76-3958b904605e'::uuid, 'Toalla húmeda', null, null),
    ('01609938-8d39-44c5-9843-34ce29cd3824'::uuid, 'Café', null, null),
    ('9bf6364b-ccc1-400b-b7f1-8d7f911fdb36'::uuid, 'Café', null, null),
    ('7bc827d6-aca5-4722-89ce-e5e85087ac07'::uuid, 'Café', null, null),
    ('560c1859-c619-4d38-9731-d759effe538f'::uuid, 'Café', null, null),
    ('39b1c468-445d-4e23-9529-efacb42eb3ce'::uuid, 'Completo', null, null),
    ('988bfaf2-ada1-485c-9edc-8e728e3192af'::uuid, 'Completo', null, null),
    ('af34fa2a-bf10-4ec1-881b-f7dd462aa43e'::uuid, 'Completo', null, null),
    ('cb1af5a2-ff7a-4431-a8c3-13f004996881'::uuid, 'Completo', null, null),
    ('2d4f28b4-1f24-4eb0-b0b7-9c26e81ca618'::uuid, 'Completo', null, null),
    ('7c5e2d53-e2cb-4530-8d86-453cfee7006c'::uuid, 'Completo', null, null),
    ('4ba371e1-8532-431f-9d39-6d891ea691c9'::uuid, 'Electromechanics', null, null),
    ('aa195df3-8e12-42c5-801c-99ff8a1bedcb'::uuid, 'Electromechanics', null, null),
    ('0da0f82b-68eb-4b73-a88e-096c19bfa12f'::uuid, 'Subway', null, null),
    ('17e5680d-3310-43d7-8ba0-e90256ba0bbb'::uuid, 'Lechuga Costina Corazón', null, null),
    ('fd69dd1c-cb91-41f4-aeaf-c796ac8f2886'::uuid, 'Pack Salsa Tomate', null, null),
    ('1e4a3a81-ce15-4b24-adde-6deeeb719c25'::uuid, 'Fideo Huevo', null, null),
    ('c9938e2c-a982-4424-873a-2dea71d6363f'::uuid, 'Fideo Huevo', null, null),
    ('72253375-a3d9-4def-9fe1-ff2a2bdc2f7a'::uuid, 'Escritorio Home Studio', null, null),
    ('3f857b2b-6344-4f24-851a-0d6bfbfa978b'::uuid, 'Mesa Comedor', null, null),
    ('5f9c439d-32ef-441c-88ad-9bc73241922a'::uuid, 'Bebida', null, null),
    ('80cba8ff-109b-42e3-9a68-396c1c9b0dad'::uuid, 'Queque', null, null),
    ('00d12c6c-61c9-425a-8c7b-7c6a73a45630'::uuid, 'Queque', null, null),
    ('0a2b967c-a339-46af-b6da-6f958002daa4'::uuid, 'Servilleta', 'Elite', null),
    ('ef4398f9-7922-4d47-ba1d-cfaeb1e5cf2a'::uuid, 'Leche Entera', 'Colún', null),
    ('8551e807-0b5c-48ec-beea-dec94e68aede'::uuid, 'Leche Entera', 'Colún', null),
    ('ce1c2d5a-92b6-4e07-9c2e-fd8a4a67e9be'::uuid, 'Chocolate', 'Sahne Nuss', null),
    ('b0ec6e54-c855-4d06-93b1-d49b401bc560'::uuid, 'Hallulla', null, 0.674),
    ('a13bb25b-aa30-4c34-9353-4a33134f0221'::uuid, 'Papel higiénico', 'Elite', null),
    ('738f00f2-d42d-4783-9c9c-911b342324a6'::uuid, 'Toalla Nova', 'Nova', null),
    ('5f8b483d-50d8-431e-b6d9-15115a04dc13'::uuid, 'Lomo Centro', null, null),
    ('7980ae74-3e16-4988-9cb5-68f73e2685bc'::uuid, 'Pechuga Pollo', 'Ariztía', null),
    ('258732aa-a6d4-4a12-bcd0-e297ebe27aa6'::uuid, 'Pechuga Pollo', 'Ariztía', null),
    ('2b4e6a67-716e-4b01-8fc9-59024369a9d4'::uuid, 'Soldadura', null, null),
    ('9b876f60-f7f9-4a0a-ac66-ea579b6c368c'::uuid, 'Tapa olla 14 cm', null, null),
    ('a34cdb21-5889-4494-a869-ef6a87740353'::uuid, 'Tapa olla 24 cm', null, null),
    ('bcb38382-e419-45ff-be01-88f1b8161e44'::uuid, 'Escurridor', null, null),
    ('20101589-f0b1-4d5c-9d18-7215b560f6d1'::uuid, 'Papelero baño', null, null),
    ('b3650e2e-0031-4b2a-b51a-0bd77834cb42'::uuid, 'Tendedero', null, null),
    ('1d469b5f-5629-43c7-9f79-931b333a1fa0'::uuid, 'Verdulero', null, null),
    ('f38becde-2a54-4da8-baa0-e3504ad5286a'::uuid, 'Huevos', null, null),
    ('1f47e2ca-70c4-4bac-9883-1a31ed256a29'::uuid, 'Huevos', null, null),
    ('68374b85-d3f1-4fe1-a7a5-5e6f91f7bd45'::uuid, 'Luz', null, null),
    ('28507918-3d50-4a20-89fa-28c801fb6ef9'::uuid, 'Enter Movil', null, null),
    ('1346d2fc-e466-4765-90ab-59b9922fc379'::uuid, 'Entel Hogar', null, null),
    ('cf3a4d87-6446-40fb-8f7f-53f34a315f09'::uuid, 'Feria', null, null),
    ('4a53e37f-cd2f-486b-a075-2cf7af0df5a5'::uuid, 'Feria', null, null),
    ('d7bc3af7-ea8d-429b-bb47-b76847a58f17'::uuid, 'Arroz', null, null),
    ('4d762ece-f112-4ca4-bb4a-ba0b2615dd42'::uuid, 'Paté de Ternera', null, null),
    ('0f9ef709-28ad-4e33-baf7-c0187b4610df'::uuid, 'Pan dobladas', null, 0.546),
    ('dbe2a47f-72e7-46ae-aad0-9964f1410f3f'::uuid, 'Chancaca', null, null),
    ('9ac5ee75-e617-4219-a59c-5c0cdef36645'::uuid, 'Sopaipilla', null, null),
    ('1b387b01-72cd-4e51-b160-85b71878600f'::uuid, 'Alfajor', null, null),
    ('ed456f5e-6583-44ea-bf85-f6cd81b7009c'::uuid, 'Remedios', null, null),
    ('0496526c-618d-4d61-b4f1-eb9d3c1b5ab9'::uuid, 'Creatina Monohidratada', null, null),
    ('04ca70ed-bad8-463b-928f-bf70135df3d3'::uuid, 'Cepillo interdental', null, null),
    ('1de7aacf-4bf7-488a-abcc-9a7b84ab5969'::uuid, 'Acondicionador Rosa Mosqueta', null, null),
    ('08981b15-57b9-4480-b06a-c0f6f04f1295'::uuid, 'Enjuague bucal', null, null),
    ('aae2cede-06e7-46fe-adf2-d34ef036a216'::uuid, 'Confort', 'Elite', null),
    ('df886a90-c499-4fc7-bbcd-941487984169'::uuid, 'Pana pollo', 'Ariztía', null),
    ('c663fe5e-a795-4740-97a8-0cd41ca03241'::uuid, 'Pechuga pollo', 'Ariztía', null),
    ('7c583ba8-82f1-457e-8753-8300992f5d46'::uuid, 'Atún agua', null, null),
    ('8861fee6-7167-440b-bca8-85d2d70a1b46'::uuid, 'Netlify', null, null),
    ('67b0d12e-f93d-460e-b916-21a568dd249a'::uuid, 'Pan', null, null),
    ('0be4e4dc-a51c-4fbb-b603-8356c1d92326'::uuid, 'Pan', null, null),
    ('ee9e5a73-185b-48d2-bfdb-7401c38cee40'::uuid, 'Bolsas de basura', null, null),
    ('c4b49fdf-04c1-4c2b-8545-54fbf677caf2'::uuid, 'GGCC', null, null),
    ('d27b8dbd-27f4-4d84-bcc9-414dee8abb22'::uuid, 'Mendocino', null, null),
    ('1657a93a-31fb-46fc-abb2-9140de37fe8c'::uuid, 'Lechuga', null, null),
    ('5f80e22d-dc7a-4eb8-a864-ad8689ba00d3'::uuid, 'Chocolate de leche', 'Costanuss', null),
    ('58adce67-3d80-4578-9af8-1f19c7e67980'::uuid, 'Queso chanco', null, null),
    ('798a5c0c-3207-4a81-bb00-26d40266296d'::uuid, 'Champiñon', null, null),
    ('2dcbe27c-5999-429e-8b52-eb0141344e43'::uuid, 'Trutro pollo', null, null);

  update public.items_detalle i
  set producto_id = p.id,
      cantidad_medida = v.cantidad_medida
  from tmp_vinculo v
  join public.productos p
    on public.normalizar_texto(p.nombre) = public.normalizar_texto(v.nombre)
   and coalesce(public.normalizar_texto(p.marca), '') = coalesce(public.normalizar_texto(v.marca), '')
   and p.user_id = v_usuario
  where i.id = v.item_id;

  get diagnostics v_ligados = row_count;
  raise notice 'Ítems vinculados a un producto: %', v_ligados;

  select count(*) into v_huerfanos from public.items_detalle where producto_id is null;
  if v_huerfanos > 0 then
    raise warning '% ítems quedaron sin producto.', v_huerfanos;
  else
    raise notice 'Todos los ítems tienen producto.';
  end if;
end $$;

-- Ya no hace falta: su contenido vive ahora en tres sitios distintos, cada
-- uno con su significado.
alter table public.items_detalle drop column if exists peso_volumen;

commit;

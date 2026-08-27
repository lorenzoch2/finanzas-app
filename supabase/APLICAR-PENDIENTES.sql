-- =====================================================================
-- FINANZAPP v3 - MIGRACIONES PENDIENTES (0010 a 0015)
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
--   0010  Retira un trigger obsoleto que traia la base y que rompia
--         cualquier escritura sobre items_detalle.
--   0011  Taxonomia nueva: 10 categorias y 41 subcategorias. Remapea los 93
--         items uno por uno. De 29% sin categoria a 0%.
--   0012  Catalogo de 75 productos y unidades estructuradas.
--   0013  Establecimientos, para comparar donde compras.
--   0014  Transferencias entre cuentas propias y cuenta principal.
--   0015  Limite de gasto mensual, con avance y proyeccion.
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla se revierte entero.
-- =====================================================================

-- ============================================================
-- 0010_limpiar_triggers.sql
-- ============================================================
-- 0010 - Retirar triggers obsoletos de items_detalle
--
-- El fallo que lo destapo, al intentar recategorizar los items:
--
--   ERROR: record "new" has no field "precio_original"
--   CONTEXT: PL/pgSQL assignment
--            "NEW.precio_final := NEW.precio_original - NEW.descuento_monto"
--            PL/pgSQL function calcular_precio_final()
--
-- Que paso: la base traia un trigger anterior a este trabajo que calculaba
-- `precio_final` a mano en cada escritura. La migracion 0004 elimino
-- `precio_original` y convirtio `precio_final` en columna generada, pero
-- dejo el trigger vivo, apuntando a columnas que ya no existen.
--
-- Por que no se detecto antes: el esquema solo se podia inspeccionar a
-- traves de PostgREST, que expone tablas y columnas pero NO triggers. Habia
-- codigo ejecutandose en cada escritura que no era visible desde fuera. La
-- migracion 0004 debio comprobar dependencias antes de soltar columnas.
--
-- Ademas de ser obsoleto, ese trigger ya no podria funcionar aunque las
-- columnas existieran: asignar a una columna GENERATED ALWAYS esta prohibido.
--
-- Esta migracion no borra un trigger concreto por su nombre, sino cualquiera
-- sobre items_detalle que toque columnas eliminadas o generadas. Si hubiera
-- mas de uno, caen todos y quedan listados en el aviso.

begin;

do $$
declare
  r          record;
  v_fuente   text;
  v_borrados int := 0;
  v_lista    text := '';
begin
  for r in
    select t.tgname, p.proname, p.oid as fn_oid
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p      on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname = 'items_detalle'
      and not t.tgisinternal
  loop
    begin
      v_fuente := pg_get_functiondef(r.fn_oid);
    exception when others then
      v_fuente := '';
    end;

    -- Columnas que ya no existen, o que ahora son generadas y por tanto no
    -- se pueden escribir desde un trigger.
    if v_fuente ~* '(precio_original|peso_volumen|precio_final|descuento_porcentaje|tuvo_descuento|total_linea)' then
      execute format('drop trigger if exists %I on public.items_detalle', r.tgname);
      v_borrados := v_borrados + 1;
      v_lista := v_lista || r.tgname || ' (' || r.proname || '), ';

      -- La funcion solo se suelta si no la usa ningun otro trigger.
      if not exists (
        select 1 from pg_trigger t2 where t2.tgfoid = r.fn_oid and not t2.tgisinternal
      ) then
        execute format('drop function if exists public.%I() cascade', r.proname);
      end if;
    end if;
  end loop;

  if v_borrados > 0 then
    raise notice 'Triggers obsoletos retirados: % -> %', v_borrados, rtrim(v_lista, ', ');
  else
    raise notice 'No habia triggers obsoletos en items_detalle.';
  end if;
end $$;

-- Deja constancia de lo que queda vivo, para que no vuelva a haber codigo
-- invisible ejecutandose en cada escritura.
do $$
declare
  v_restantes text;
begin
  select string_agg(c.relname || '.' || t.tgname, ', ' order by c.relname, t.tgname)
  into v_restantes
  from pg_trigger t
  join pg_class c     on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal;

  raise notice 'Triggers activos ahora: %', coalesce(v_restantes, 'ninguno');
end $$;

commit;


-- ============================================================
-- 0011_categorias_v3.sql
-- ============================================================
-- 0011 - Taxonomia de categorias v3
--
-- GENERADO por scripts/generar-migracion-categorias.mjs desde
-- scripts/taxonomia.mjs. No editar a mano: regenerar.
--
-- Por que se rehace la taxonomia:
--
--   * De las 17 categorias anteriores, 7 no se usaron nunca.
--   * "Alimentacion" acumulaba 40 items mezclando compra de supermercado,
--     comida al paso, snacks, bebidas y suplementos deportivos. Con todo en
--     el mismo saco no se podia analizar nada.
--   * 27 items (29%) estaban sin categoria porque no existia ninguna donde
--     pusieran encajar: menaje, muebles, ferreteria.
--   * Un mismo tipo de gasto se clasificaba distinto segun el dia: "Pizza" y
--     "Cafe" aparecian a la vez en "Alimentacion" y en "Restaurantes".
--
-- Resultado: 51 categorias (10 principales) y los 72 productos
-- historicos mapeados uno por uno. Ningun item queda sin clasificar.
--
-- Reversible: el backup previo permite reconstruir el estado anterior.

begin;

-- ------------------------------------------- Apartar las categorias viejas
-- La taxonomia nueva reutiliza nombres que ya existen: Transporte, Educacion,
-- Regalos, Viajes, Arriendo e Imprevistos. Como `categorias` no tiene
-- restriccion de unicidad por nombre, buscar la categoria padre por su nombre
-- podria encontrar la ANTIGUA y colgar las subcategorias del sitio
-- equivocado, en silencio.
--
-- Renombrarlas antes elimina la ambiguedad. Al final del archivo se borran.
update public.categorias
set nombre = nombre || ' (antigua)'
where parent_id is null
  and nombre in (
    'Ahorro',U&'Alimentaci\00F3n','Arriendo','Compras personales',U&'Educaci\00F3n','Entretenimiento',
    'Higiene','Imprevistos',U&'Internet/Telefon\00EDa','Regalos',U&'Restaurantes/Comida R\00E1pida',
    'Ropa','Salud',U&'Servicios b\00E1sicos','Suscripciones','Transporte','Viajes'
  );

-- ------------------------------------------------------- Taxonomia nueva
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
    (U&'L\00E1cteos y huevos', 'Supermercado y despensa'),
    (U&'Panader\00EDa', 'Supermercado y despensa'),
    ('Abarrotes', 'Supermercado y despensa'),
    (U&'Caf\00E9 e infusiones', 'Supermercado y despensa'),
    ('Snacks y dulces', 'Supermercado y despensa'),
    ('Bebidas', 'Supermercado y despensa'),
    ('Feria', 'Supermercado y despensa'),
    ('Comer fuera', null),
    (U&'Comida r\00E1pida', 'Comer fuera'),
    ('Restaurante', 'Comer fuera'),
    (U&'Cafeter\00EDa', 'Comer fuera'),
    ('Delivery', 'Comer fuera'),
    ('Alcohol', null),
    ('Para la casa', 'Alcohol'),
    ('Salidas y bares', 'Alcohol'),
    ('Hogar', null),
    ('Aseo y limpieza', 'Hogar'),
    ('Menaje y cocina', 'Hogar'),
    ('Muebles', 'Hogar'),
    (U&'Ferreter\00EDa', 'Hogar'),
    ('Salud y cuidado personal', null),
    ('Higiene personal', 'Salud y cuidado personal'),
    ('Farmacia', 'Salud y cuidado personal'),
    (U&'Consultas y ex\00E1menes', 'Salud y cuidado personal'),
    ('Deporte y suplementos', 'Salud y cuidado personal'),
    ('Cuentas y servicios', null),
    ('Luz, agua y gas', 'Cuentas y servicios'),
    ('Gastos comunes', 'Cuentas y servicios'),
    (U&'Internet y telefon\00EDa', 'Cuentas y servicios'),
    ('Arriendo', 'Cuentas y servicios'),
    ('Suscripciones digitales', null),
    ('Streaming', 'Suscripciones digitales'),
    ('Herramientas y software', 'Suscripciones digitales'),
    ('Transporte', null),
    ('Combustible', 'Transporte'),
    (U&'Transporte p\00FAblico', 'Transporte'),
    ('Apps de movilidad', 'Transporte'),
    (U&'Veh\00EDculo', 'Transporte'),
    ('Compras personales', null),
    ('Ropa y calzado', 'Compras personales'),
    (U&'Tecnolog\00EDa', 'Compras personales'),
    ('Entretenimiento', 'Compras personales'),
    ('Regalos', 'Compras personales'),
    ('Otros', null),
    (U&'Educaci\00F3n', 'Otros'),
    ('Viajes', 'Otros'),
    ('Imprevistos', 'Otros'),
    (U&'Pr\00E9stamos a terceros', 'Otros');

  -- Principales
  for r in select nombre from tmp_taxonomia where padre is null loop
    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, null, v_usuario);
  end loop;

  -- Subcategorias
  for r in select nombre, padre from tmp_taxonomia where padre is not null loop
    select id into v_padre
      from public.categorias
      where nombre = r.padre and parent_id is null and user_id = v_usuario;

    if v_padre is null then
      raise exception 'No se encontro la categoria padre %', r.padre;
    end if;

    insert into public.categorias (nombre, parent_id, user_id)
    values (r.nombre, v_padre, v_usuario);
  end loop;
end $$;

-- --------------------------------------------------- Remapeo de los items
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
    (U&'At\00FAn agua', 'Carnes y pescados'),
    ('Bebida', U&'Cafeter\00EDa'),
    ('Bolsas de basura', 'Aseo y limpieza'),
    (U&'Caf\00E9', U&'Caf\00E9 e infusiones'),
    (U&'Caf\00E9 Descafeinado', U&'Caf\00E9 e infusiones'),
    ('Cepillo interdental', 'Higiene personal'),
    ('Cerveza', 'Para la casa'),
    (U&'Champi\00F1on', 'Frutas y verduras'),
    ('Chancaca', 'Abarrotes'),
    ('Chocolate', 'Snacks y dulces'),
    ('Chocolate de leche', 'Snacks y dulces'),
    (U&'Colaci\00F3n Pollo Asado', U&'Comida r\00E1pida'),
    ('Completo', U&'Comida r\00E1pida'),
    ('Confort', 'Aseo y limpieza'),
    ('Creatina Monohidratada', 'Deporte y suplementos'),
    (U&'Datos M\00F3viles', U&'Internet y telefon\00EDa'),
    ('Electromechanics', U&'Educaci\00F3n'),
    ('Enjuague bucal', 'Higiene personal'),
    ('Entel Hogar', U&'Internet y telefon\00EDa'),
    ('Enter Movil', U&'Internet y telefon\00EDa'),
    ('Escritorio Home Studio', 'Muebles'),
    ('Escurridor', 'Menaje y cocina'),
    ('Feria', 'Feria'),
    ('Fideo Huevo', 'Abarrotes'),
    ('Gatorade', 'Bebidas'),
    ('GGCC', 'Gastos comunes'),
    ('Hallulla', U&'Panader\00EDa'),
    ('Huevos', U&'L\00E1cteos y huevos'),
    ('Leche Entera', U&'L\00E1cteos y huevos'),
    ('Lechuga', 'Frutas y verduras'),
    (U&'Lechuga Costina Coraz\00F3n', 'Frutas y verduras'),
    ('Lomo Centro', 'Carnes y pescados'),
    ('Luz', 'Luz, agua y gas'),
    ('Mendocino', 'Snacks y dulces'),
    ('Mesa Comedor', 'Muebles'),
    ('Netlify', 'Herramientas y software'),
    ('Nuez', 'Abarrotes'),
    ('Pack Salsa Tomate', 'Abarrotes'),
    ('Pan', U&'Panader\00EDa'),
    ('Pan dobladas', U&'Panader\00EDa'),
    ('Pana pollo', 'Carnes y pescados'),
    (U&'Papel higi\00E9nico', 'Aseo y limpieza'),
    (U&'Papelero ba\00F1o', 'Menaje y cocina'),
    (U&'Pat\00E9 de Ternera', 'Carnes y pescados'),
    ('Pechuga pollo', 'Carnes y pescados'),
    ('Pechuga Pollo', 'Carnes y pescados'),
    ('Pesas tobilleras', 'Deporte y suplementos'),
    ('Piscola', 'Para la casa'),
    ('Pizza', U&'Comida r\00E1pida'),
    (U&'Pr\00E9stamo pap\00E1', U&'Pr\00E9stamos a terceros'),
    ('Queque', U&'Cafeter\00EDa'),
    ('Queso chanco', U&'L\00E1cteos y huevos'),
    ('Red', U&'Transporte p\00FAblico'),
    ('Remedios', 'Farmacia'),
    ('Sandwich', U&'Comida r\00E1pida'),
    ('Servilleta', 'Aseo y limpieza'),
    ('Soldadura', U&'Ferreter\00EDa'),
    ('Sopaipilla', U&'Panader\00EDa'),
    ('Subway', U&'Comida r\00E1pida'),
    ('Suerox', 'Bebidas'),
    ('Tapa olla', 'Menaje y cocina'),
    ('Tendedero', 'Menaje y cocina'),
    (U&'Toalla h\00FAmeda', 'Aseo y limpieza'),
    ('Toalla Nova', 'Aseo y limpieza'),
    ('Trutro pollo', 'Carnes y pescados'),
    ('Twix', 'Snacks y dulces'),
    ('Verdulero', 'Menaje y cocina'),
    ('Wifi', U&'Internet y telefon\00EDa'),
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
  raise notice 'Items recategorizados: %', v_migrados;

  -- Nada puede quedarse atras sin que se note.
  select count(*) into v_sin_mapa
  from public.items_detalle i
  where i.categoria_id is null;

  if v_sin_mapa > 0 then
    raise warning '% items quedaron sin categoria. Revisa scripts/taxonomia.mjs.', v_sin_mapa;
  else
    raise notice 'Todos los items tienen categoria.';
  end if;
end $$;

-- ------------------------------------------------- Retirar las antiguas
-- Se reconocen por el sufijo que se les puso al principio, no por su nombre
-- original: asi no hay forma de borrar por error una categoria nueva que se
-- llame igual.
--
-- Solo se van las que ya no usa nadie. Si alguna conservara items, se queda y
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
    raise warning 'Categorias antiguas todavia con items, no se borran: %', v_en_uso;
  end if;

  delete from public.categorias c
  where c.nombre like '%(antigua)'
    and not exists (select 1 from public.categorias h where h.parent_id = c.id)
    and not exists (select 1 from public.items_detalle i where i.categoria_id = c.id);
  -- No se comprueba `productos`: esa tabla nace en 0012, despues de esta.

  get diagnostics v_borradas = row_count;
  raise notice 'Categorias antiguas retiradas: %', v_borradas;
end $$;

commit;


-- ============================================================
-- 0012_productos.sql
-- ============================================================
-- 0012 - Catalogo de productos y unidades estructuradas
--
-- GENERADO por scripts/generar-migracion-productos.mjs. No editar a mano.
--
-- Dos problemas que resuelve:
--
-- 1. IDENTIDAD DE PRODUCTO. El nombre era texto libre y ya se estaba
--    duplicando: "Colun" y "Colun", "Pechuga Pollo" y "Pechuga pollo". Sin
--    identidad estable no se puede comparar el mismo producto entre
--    establecimientos ni seguir su precio en el tiempo, que es justo para lo
--    que se quiere el catalogo.
--
-- 2. `peso_volumen` MEZCLABA TRES COSAS en un texto libre con 17 formatos:
--
--      contenido del envase   170 g cafe, 250 g chocolate, 30 huevos, 4 rollos
--                             -> va en el producto: no cambia entre compras
--
--      peso variable          0,674 kg de hallulla, 0,546 kg de pan
--                             -> va en la compra: cambia cada vez
--
--      atributo del objeto    tapa de olla de 14 cm frente a una de 24 cm
--                             -> pasa al nombre: son productos distintos
--
--    El mismo texto significaba cosas distintas segun el producto ("4 kg" en
--    unas pesas es el peso del objeto; "250 g" en un chocolate es contenido),
--    asi que la interpretacion se decidio caso por caso, no con una regla
--    automatica.
--
-- Resultado: 75 productos, 12 con contenido medible y 2 vendidos a granel.

begin;

-- Normalizacion estable para comparar nombres. Sin extension unaccent:
-- translate() basta para el espanol y es inmutable, que es lo que exige un
-- indice unico.
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
      U&'\00E1\00E0\00E4\00E2\00E3\00E9\00E8\00EB\00EA\00ED\00EC\00EF\00EE\00F3\00F2\00F6\00F4\00F5\00FA\00F9\00FC\00FB\00F1\00C1\00C0\00C4\00C2\00C3\00C9\00C8\00CB\00CA\00CD\00CC\00CF\00CE\00D3\00D2\00D6\00D4\00D5\00DA\00D9\00DC\00DB\00D1',
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

-- Lo que impide que vuelvan a existir dos "Leche Entera Colun" distintos.
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

-- El peso real de una compra a granel: cambia en cada compra, asi que vive
-- en el item y no en el producto.
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
    ('Red', null, U&'Transporte p\00FAblico', null, null, 'unidad'),
    (U&'Colaci\00F3n Pollo Asado', 'Polloteka', U&'Comida r\00E1pida', null, null, 'unidad'),
    ('Gatorade', null, 'Bebidas', null, null, 'unidad'),
    ('Twix', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Piscola', null, 'Para la casa', null, null, 'unidad'),
    (U&'Pr\00E9stamo pap\00E1', null, U&'Pr\00E9stamos a terceros', null, null, 'unidad'),
    ('Sandwich 15 cm', 'Subway', U&'Comida r\00E1pida', null, null, 'unidad'),
    (U&'Caf\00E9', U&'Nescaf\00E9', U&'Caf\00E9 e infusiones', null, null, 'unidad'),
    (U&'Datos M\00F3viles', 'Entel', U&'Internet y telefon\00EDa', null, null, 'unidad'),
    ('Wifi', 'Entel', U&'Internet y telefon\00EDa', null, null, 'unidad'),
    (U&'Caf\00E9 Descafeinado', 'Gold', U&'Caf\00E9 e infusiones', 170, 'g', 'unidad'),
    ('Nuez', null, 'Abarrotes', 1, 'kg', 'unidad'),
    ('Pesas tobilleras 4 kg', 'Fitnics', 'Deporte y suplementos', null, null, 'unidad'),
    ('Youtube', null, 'Streaming', null, null, 'unidad'),
    ('Pizza', null, U&'Comida r\00E1pida', null, null, 'unidad'),
    ('Cerveza', 'Heineken', 'Para la casa', null, null, 'unidad'),
    ('Piscola', 'Alto del Carmen', 'Para la casa', null, null, 'unidad'),
    ('Suerox', null, 'Bebidas', null, null, 'unidad'),
    (U&'Toalla h\00FAmeda', null, 'Aseo y limpieza', null, null, 'unidad'),
    (U&'Caf\00E9', null, U&'Caf\00E9 e infusiones', null, null, 'unidad'),
    ('Completo', null, U&'Comida r\00E1pida', null, null, 'unidad'),
    ('Electromechanics', null, U&'Educaci\00F3n', null, null, 'unidad'),
    ('Subway', null, U&'Comida r\00E1pida', null, null, 'unidad'),
    (U&'Lechuga Costina Coraz\00F3n', null, 'Frutas y verduras', 3, 'unidad', 'unidad'),
    ('Pack Salsa Tomate', null, 'Abarrotes', null, null, 'unidad'),
    ('Fideo Huevo', null, 'Abarrotes', null, null, 'unidad'),
    ('Escritorio Home Studio', null, 'Muebles', null, null, 'unidad'),
    ('Mesa Comedor', null, 'Muebles', null, null, 'unidad'),
    ('Bebida', null, U&'Cafeter\00EDa', null, null, 'unidad'),
    ('Queque', null, U&'Cafeter\00EDa', null, null, 'unidad'),
    ('Servilleta', 'Elite', 'Aseo y limpieza', null, null, 'unidad'),
    ('Leche Entera', U&'Col\00FAn', U&'L\00E1cteos y huevos', null, null, 'unidad'),
    ('Chocolate', 'Sahne Nuss', 'Snacks y dulces', 250, 'g', 'unidad'),
    ('Hallulla', null, U&'Panader\00EDa', null, null, 'peso'),
    (U&'Papel higi\00E9nico', 'Elite', 'Aseo y limpieza', 4, 'unidad', 'unidad'),
    ('Toalla Nova', 'Nova', 'Aseo y limpieza', 2, 'unidad', 'unidad'),
    ('Lomo Centro', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Pechuga Pollo', U&'Arizt\00EDa', 'Carnes y pescados', 500, 'g', 'unidad'),
    ('Soldadura', null, U&'Ferreter\00EDa', 1, 'kg', 'unidad'),
    ('Tapa olla 14 cm', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Tapa olla 24 cm', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Escurridor', null, 'Menaje y cocina', null, null, 'unidad'),
    (U&'Papelero ba\00F1o', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Tendedero', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Verdulero', null, 'Menaje y cocina', null, null, 'unidad'),
    ('Huevos', null, U&'L\00E1cteos y huevos', 30, 'unidad', 'unidad'),
    ('Luz', null, 'Luz, agua y gas', null, null, 'unidad'),
    ('Enter Movil', null, U&'Internet y telefon\00EDa', null, null, 'unidad'),
    ('Entel Hogar', null, U&'Internet y telefon\00EDa', null, null, 'unidad'),
    ('Feria', null, 'Feria', null, null, 'unidad'),
    ('Arroz', null, 'Abarrotes', null, null, 'unidad'),
    (U&'Pat\00E9 de Ternera', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Pan dobladas', null, U&'Panader\00EDa', null, null, 'peso'),
    ('Chancaca', null, 'Abarrotes', null, null, 'unidad'),
    ('Sopaipilla', null, U&'Panader\00EDa', null, null, 'unidad'),
    ('Alfajor', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Remedios', null, 'Farmacia', null, null, 'unidad'),
    ('Creatina Monohidratada', null, 'Deporte y suplementos', 300, 'g', 'unidad'),
    ('Cepillo interdental', null, 'Higiene personal', null, null, 'unidad'),
    ('Acondicionador Rosa Mosqueta', null, 'Higiene personal', null, null, 'unidad'),
    ('Enjuague bucal', null, 'Higiene personal', null, null, 'unidad'),
    ('Confort', 'Elite', 'Aseo y limpieza', 4, 'unidad', 'unidad'),
    ('Pana pollo', U&'Arizt\00EDa', 'Carnes y pescados', null, null, 'unidad'),
    ('Pechuga pollo', U&'Arizt\00EDa', 'Carnes y pescados', 480, 'g', 'unidad'),
    (U&'At\00FAn agua', null, 'Carnes y pescados', null, null, 'unidad'),
    ('Netlify', null, 'Herramientas y software', null, null, 'unidad'),
    ('Pan', null, U&'Panader\00EDa', null, null, 'unidad'),
    ('Bolsas de basura', null, 'Aseo y limpieza', null, null, 'unidad'),
    ('GGCC', null, 'Gastos comunes', null, null, 'unidad'),
    ('Mendocino', null, 'Snacks y dulces', null, null, 'unidad'),
    ('Lechuga', null, 'Frutas y verduras', null, null, 'unidad'),
    ('Chocolate de leche', 'Costanuss', 'Snacks y dulces', null, null, 'unidad'),
    ('Queso chanco', null, U&'L\00E1cteos y huevos', null, null, 'unidad'),
    (U&'Champi\00F1on', null, 'Frutas y verduras', null, null, 'unidad'),
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

  -- Vincular cada item con su producto y guardar el peso real si era granel.
  create temporary table tmp_vinculo (
    item_id uuid, nombre text, marca text, cantidad_medida numeric
  ) on commit drop;

  insert into tmp_vinculo values
    ('236f2157-c3f6-4448-9d4e-b9fa80805aa7'::uuid, 'Red', null, null),
    ('5f714285-c6c4-42b1-8e90-2400a8ae1fd8'::uuid, U&'Colaci\00F3n Pollo Asado', 'Polloteka', null),
    ('61b9a007-23c5-48fb-831a-facd0de4ad40'::uuid, 'Gatorade', null, null),
    ('c0eadb4e-e9a1-4ad9-a4f4-dcb419bfb55c'::uuid, 'Twix', null, null),
    ('f198a5aa-5e9e-4617-9fe8-ed5c83b23c70'::uuid, 'Piscola', null, null),
    ('f13d9975-8cc7-4177-b25c-d97497f98597'::uuid, 'Piscola', null, null),
    ('0aeabcf3-8763-4469-b24d-285f2a3b3088'::uuid, U&'Pr\00E9stamo pap\00E1', null, null),
    ('849e9b16-3131-49f2-a3e6-1a90e3449ea8'::uuid, 'Sandwich 15 cm', 'Subway', null),
    ('84fa20fb-e168-48c8-be96-74e1d0dbdf58'::uuid, U&'Caf\00E9', U&'Nescaf\00E9', null),
    ('5bf16aa9-0316-46ed-8726-a583277af8d3'::uuid, U&'Datos M\00F3viles', 'Entel', null),
    ('487aabaa-ca38-482d-89d8-d466b9d53cf1'::uuid, 'Wifi', 'Entel', null),
    ('5b6ff102-08ae-4ee7-9ff6-a6fb2221fc86'::uuid, U&'Caf\00E9 Descafeinado', 'Gold', null),
    ('9163f0f1-0157-46a0-aee7-4031639e0eb6'::uuid, 'Nuez', null, null),
    ('4300402b-6152-4b4b-b439-fb251c95d7b9'::uuid, 'Pesas tobilleras 4 kg', 'Fitnics', null),
    ('c08feee5-c2da-41e3-9299-c066f5abfa42'::uuid, 'Youtube', null, null),
    ('d94b02b9-18ff-4a9f-9965-c8ebe04ab644'::uuid, 'Pizza', null, null),
    ('06914513-1a8c-4876-b0f8-b35049a3eaa1'::uuid, 'Pizza', null, null),
    ('dc8a4813-756a-439f-80ad-d53c6429777f'::uuid, 'Cerveza', 'Heineken', null),
    ('7b130831-c7fa-4512-88f9-2b02eb79fff8'::uuid, 'Piscola', 'Alto del Carmen', null),
    ('2c766d01-318b-42a8-b139-7e6877bb0f63'::uuid, 'Suerox', null, null),
    ('892bdb7a-1a10-40f1-8e76-3958b904605e'::uuid, U&'Toalla h\00FAmeda', null, null),
    ('01609938-8d39-44c5-9843-34ce29cd3824'::uuid, U&'Caf\00E9', null, null),
    ('9bf6364b-ccc1-400b-b7f1-8d7f911fdb36'::uuid, U&'Caf\00E9', null, null),
    ('7bc827d6-aca5-4722-89ce-e5e85087ac07'::uuid, U&'Caf\00E9', null, null),
    ('560c1859-c619-4d38-9731-d759effe538f'::uuid, U&'Caf\00E9', null, null),
    ('39b1c468-445d-4e23-9529-efacb42eb3ce'::uuid, 'Completo', null, null),
    ('988bfaf2-ada1-485c-9edc-8e728e3192af'::uuid, 'Completo', null, null),
    ('af34fa2a-bf10-4ec1-881b-f7dd462aa43e'::uuid, 'Completo', null, null),
    ('cb1af5a2-ff7a-4431-a8c3-13f004996881'::uuid, 'Completo', null, null),
    ('2d4f28b4-1f24-4eb0-b0b7-9c26e81ca618'::uuid, 'Completo', null, null),
    ('7c5e2d53-e2cb-4530-8d86-453cfee7006c'::uuid, 'Completo', null, null),
    ('4ba371e1-8532-431f-9d39-6d891ea691c9'::uuid, 'Electromechanics', null, null),
    ('aa195df3-8e12-42c5-801c-99ff8a1bedcb'::uuid, 'Electromechanics', null, null),
    ('0da0f82b-68eb-4b73-a88e-096c19bfa12f'::uuid, 'Subway', null, null),
    ('17e5680d-3310-43d7-8ba0-e90256ba0bbb'::uuid, U&'Lechuga Costina Coraz\00F3n', null, null),
    ('fd69dd1c-cb91-41f4-aeaf-c796ac8f2886'::uuid, 'Pack Salsa Tomate', null, null),
    ('1e4a3a81-ce15-4b24-adde-6deeeb719c25'::uuid, 'Fideo Huevo', null, null),
    ('c9938e2c-a982-4424-873a-2dea71d6363f'::uuid, 'Fideo Huevo', null, null),
    ('72253375-a3d9-4def-9fe1-ff2a2bdc2f7a'::uuid, 'Escritorio Home Studio', null, null),
    ('3f857b2b-6344-4f24-851a-0d6bfbfa978b'::uuid, 'Mesa Comedor', null, null),
    ('5f9c439d-32ef-441c-88ad-9bc73241922a'::uuid, 'Bebida', null, null),
    ('80cba8ff-109b-42e3-9a68-396c1c9b0dad'::uuid, 'Queque', null, null),
    ('00d12c6c-61c9-425a-8c7b-7c6a73a45630'::uuid, 'Queque', null, null),
    ('0a2b967c-a339-46af-b6da-6f958002daa4'::uuid, 'Servilleta', 'Elite', null),
    ('ef4398f9-7922-4d47-ba1d-cfaeb1e5cf2a'::uuid, 'Leche Entera', U&'Col\00FAn', null),
    ('8551e807-0b5c-48ec-beea-dec94e68aede'::uuid, 'Leche Entera', U&'Col\00FAn', null),
    ('ce1c2d5a-92b6-4e07-9c2e-fd8a4a67e9be'::uuid, 'Chocolate', 'Sahne Nuss', null),
    ('b0ec6e54-c855-4d06-93b1-d49b401bc560'::uuid, 'Hallulla', null, 0.674),
    ('a13bb25b-aa30-4c34-9353-4a33134f0221'::uuid, U&'Papel higi\00E9nico', 'Elite', null),
    ('738f00f2-d42d-4783-9c9c-911b342324a6'::uuid, 'Toalla Nova', 'Nova', null),
    ('5f8b483d-50d8-431e-b6d9-15115a04dc13'::uuid, 'Lomo Centro', null, null),
    ('7980ae74-3e16-4988-9cb5-68f73e2685bc'::uuid, 'Pechuga Pollo', U&'Arizt\00EDa', null),
    ('258732aa-a6d4-4a12-bcd0-e297ebe27aa6'::uuid, 'Pechuga Pollo', U&'Arizt\00EDa', null),
    ('2b4e6a67-716e-4b01-8fc9-59024369a9d4'::uuid, 'Soldadura', null, null),
    ('9b876f60-f7f9-4a0a-ac66-ea579b6c368c'::uuid, 'Tapa olla 14 cm', null, null),
    ('a34cdb21-5889-4494-a869-ef6a87740353'::uuid, 'Tapa olla 24 cm', null, null),
    ('bcb38382-e419-45ff-be01-88f1b8161e44'::uuid, 'Escurridor', null, null),
    ('20101589-f0b1-4d5c-9d18-7215b560f6d1'::uuid, U&'Papelero ba\00F1o', null, null),
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
    ('4d762ece-f112-4ca4-bb4a-ba0b2615dd42'::uuid, U&'Pat\00E9 de Ternera', null, null),
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
    ('df886a90-c499-4fc7-bbcd-941487984169'::uuid, 'Pana pollo', U&'Arizt\00EDa', null),
    ('c663fe5e-a795-4740-97a8-0cd41ca03241'::uuid, 'Pechuga pollo', U&'Arizt\00EDa', null),
    ('7c583ba8-82f1-457e-8753-8300992f5d46'::uuid, U&'At\00FAn agua', null, null),
    ('8861fee6-7167-440b-bca8-85d2d70a1b46'::uuid, 'Netlify', null, null),
    ('67b0d12e-f93d-460e-b916-21a568dd249a'::uuid, 'Pan', null, null),
    ('0be4e4dc-a51c-4fbb-b603-8356c1d92326'::uuid, 'Pan', null, null),
    ('ee9e5a73-185b-48d2-bfdb-7401c38cee40'::uuid, 'Bolsas de basura', null, null),
    ('c4b49fdf-04c1-4c2b-8545-54fbf677caf2'::uuid, 'GGCC', null, null),
    ('d27b8dbd-27f4-4d84-bcc9-414dee8abb22'::uuid, 'Mendocino', null, null),
    ('1657a93a-31fb-46fc-abb2-9140de37fe8c'::uuid, 'Lechuga', null, null),
    ('5f80e22d-dc7a-4eb8-a864-ad8689ba00d3'::uuid, 'Chocolate de leche', 'Costanuss', null),
    ('58adce67-3d80-4578-9af8-1f19c7e67980'::uuid, 'Queso chanco', null, null),
    ('798a5c0c-3207-4a81-bb00-26d40266296d'::uuid, U&'Champi\00F1on', null, null),
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
  raise notice 'Items vinculados a un producto: %', v_ligados;

  select count(*) into v_huerfanos from public.items_detalle where producto_id is null;
  if v_huerfanos > 0 then
    raise warning '% items quedaron sin producto.', v_huerfanos;
  else
    raise notice 'Todos los items tienen producto.';
  end if;
end $$;

-- Ya no hace falta: su contenido vive ahora en tres sitios distintos, cada
-- uno con su significado.
alter table public.items_detalle drop column if exists peso_volumen;

commit;


-- ============================================================
-- 0013_establecimientos.sql
-- ============================================================
-- 0012 - Establecimientos
--
-- Registrar donde se compro es lo que permite responder "donde me sale mas
-- barata la leche?". Sin esto, el catalogo de productos solo da el precio
-- historico, pero no con que compararlo.
--
-- Va en la transaccion y no en cada item: una boleta es de un solo local, y
-- pedirlo producto por producto seria repetir el mismo dato veinte veces
-- mientras se esta de pie en la caja.

begin;

create table if not exists public.establecimientos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre     text not null,
  tipo       text not null default 'otro',
  created_at timestamptz not null default now(),

  constraint chk_establecimientos_tipo check (
    tipo in ('supermercado','feria','almacen','farmacia','restaurante','online','servicio','otro')
  )
);

-- Mismo criterio de identidad que en productos: evita que "Lider" y "lider"
-- acaben siendo dos locales distintos y las comparaciones no cuadren.
create unique index if not exists uq_establecimientos_nombre
  on public.establecimientos (user_id, public.normalizar_texto(nombre));

alter table public.establecimientos enable row level security;
alter table public.establecimientos force row level security;
drop policy if exists establecimientos_propios on public.establecimientos;
create policy establecimientos_propios on public.establecimientos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.establecimientos from anon;

alter table public.transacciones
  add column if not exists establecimiento_id uuid
    references public.establecimientos(id) on delete set null;

create index if not exists idx_transacciones_establecimiento
  on public.transacciones (establecimiento_id);

commit;


-- ============================================================
-- 0014_transferencias.sql
-- ============================================================
-- 0013 - Transferencias entre cuentas propias y cuenta principal
--
-- El problema: mover plata entre tus propias cuentas no es ni un ingreso ni
-- un gasto, pero hasta ahora solo existian esos dos tipos. Registrar un
-- traspaso obligaba a anotar un egreso en el origen y un ingreso en el
-- destino, con dos efectos malos:
--
--   1. Los totales del mes se inflaban por ambos lados: $200.000 movidos de
--      una cuenta a otra aparecian como $200.000 de ingreso y $200.000 de
--      gasto que nunca ocurrieron.
--   2. Nada garantizaba que las dos mitades cuadraran. Si una fallaba o se
--      editaba sola, el dinero se creaba o desaparecia.
--
-- La solucion: UNA fila con origen y destino. No hay mitades que puedan
-- descuadrarse, y el resumen mensual las ignora, con lo que la referencia de
-- gasto se mantiene limpia aunque muevas plata entre cuentas.

begin;

-- --------------------------------------------------------- Cuenta principal
alter table public.fuentes_cuentas
  add column if not exists es_principal boolean not null default false;

-- Como mucho una principal. El indice parcial lo garantiza en la base, no
-- confiando en que la interfaz se acuerde de desmarcar la anterior.
create unique index if not exists uq_fuente_principal
  on public.fuentes_cuentas (user_id)
  where es_principal;

-- ------------------------------------------------------------ Transferencias
alter table public.transacciones
  add column if not exists fuente_destino_id uuid
    references public.fuentes_cuentas(id) on delete set null;

alter table public.transacciones drop constraint if exists chk_transacciones_tipo;
alter table public.transacciones add  constraint chk_transacciones_tipo
  check (tipo in ('ingreso', 'egreso', 'transferencia'));

-- Una transferencia necesita destino y no puede ir a la misma cuenta de la
-- que sale. Un ingreso o un egreso no tienen destino.
alter table public.transacciones drop constraint if exists chk_transacciones_destino;
alter table public.transacciones add  constraint chk_transacciones_destino
  check (
    case
      when tipo = 'transferencia' then
        fuente_id is not null
        and fuente_destino_id is not null
        and fuente_destino_id <> fuente_id
      else
        fuente_destino_id is null
    end
  );

create index if not exists idx_transacciones_destino
  on public.transacciones (fuente_destino_id)
  where fuente_destino_id is not null;

-- --------------------------------------------- Saldos, ahora con traspasos
-- Se conserva exactamente la regla anterior para ingresos y egresos: el
-- ultimo ajuste anterior al cierre del mes fija el punto de partida y desde
-- ahi se acumulan los movimientos. Lo unico que se anade es que una
-- transferencia resta en el origen y suma en el destino.
--
-- Como en el historico no hay ninguna transferencia todavia, los saldos ya
-- calculados no cambian, y eso es comprobable con el golden.
--
-- Se suelta y se recrea porque cambian las columnas devueltas (se anade
-- es_principal), y CREATE OR REPLACE no permite alterar el tipo de retorno.
drop function if exists public.saldos_por_fuente(date, text);

create function public.saldos_por_fuente(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  fuente_id     uuid,
  nombre        text,
  tipo          text,
  es_principal  boolean,
  saldo_inicial numeric,
  saldo_actual  numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes) + interval '1 month')::date        as mes_siguiente,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp
         at time zone p_tz)                                          as corte_ts
  ),
  ultimo_ajuste as (
    select distinct on (a.fuente_id)
      a.fuente_id,
      a.monto_ajustado,
      a.fecha_referencia
    from public.ajustes_saldos a
    cross join limites l
    where a.fecha_referencia < l.mes_siguiente
    order by a.fuente_id, a.fecha_referencia desc
  )
  select
    f.id,
    f.nombre,
    f.tipo,
    f.es_principal,
    coalesce(u.monto_ajustado, 0)::numeric as saldo_inicial,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(
            case
              when t.tipo = 'ingreso'                          then  t.monto
              when t.tipo = 'egreso'                           then -t.monto
              when t.tipo = 'transferencia'
                   and t.fuente_id = f.id                      then -t.monto
              when t.tipo = 'transferencia'
                   and t.fuente_destino_id = f.id              then  t.monto
              else 0
            end
          )
          from public.transacciones t
          cross join limites l2
          where (t.fuente_id = f.id or t.fuente_destino_id = f.id)
            and t.fecha >= coalesce(
                  (u.fecha_referencia::timestamp at time zone p_tz),
                  ('2020-01-01 00:00:00'::timestamp at time zone p_tz)
                )
            and t.fecha < l2.corte_ts
        ), 0)
    )::numeric as saldo_actual
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.es_principal desc, f.nombre;
$$;

grant  execute on function public.saldos_por_fuente(date, text) to authenticated;
revoke execute on function public.saldos_por_fuente(date, text) from public;

-- ------------------------------------- Guardar, ahora con destino y local
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
    raise exception 'Sin sesion activa.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.transacciones (
      tipo, monto, fecha, fuente_id, fuente_destino_id, establecimiento_id,
      nota, monto_sin_detalle, user_id
    )
    values (
      p_transaccion ->> 'tipo',
      (p_transaccion ->> 'monto')::numeric,
      (p_transaccion ->> 'fecha')::timestamptz,
      nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      nullif(p_transaccion ->> 'fuente_destino_id', '')::uuid,
      nullif(p_transaccion ->> 'establecimiento_id', '')::uuid,
      nullif(p_transaccion ->> 'nota', ''),
      coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0),
      v_usuario
    )
    returning id into v_id;
  else
    update public.transacciones set
      tipo               = p_transaccion ->> 'tipo',
      monto              = (p_transaccion ->> 'monto')::numeric,
      fecha              = (p_transaccion ->> 'fecha')::timestamptz,
      fuente_id          = nullif(p_transaccion ->> 'fuente_id', '')::uuid,
      fuente_destino_id  = nullif(p_transaccion ->> 'fuente_destino_id', '')::uuid,
      establecimiento_id = nullif(p_transaccion ->> 'establecimiento_id', '')::uuid,
      nota               = nullif(p_transaccion ->> 'nota', ''),
      monto_sin_detalle  = coalesce((p_transaccion ->> 'monto_sin_detalle')::numeric, 0)
    where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'La transaccion % no existe o no es tuya.', p_id using errcode = '42501';
    end if;

    delete from public.items_detalle where transaccion_id = v_id;
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into public.items_detalle (
      transaccion_id, producto_id, nombre_producto, marca, categoria_id,
      unidades, cantidad_medida, precio_unitario, descuento_monto, calificacion, user_id
    )
    select
      v_id,
      nullif(item ->> 'producto_id', '')::uuid,
      nullif(item ->> 'nombre_producto', ''),
      nullif(item ->> 'marca', ''),
      nullif(item ->> 'categoria_id', '')::uuid,
      coalesce((item ->> 'unidades')::numeric, 1),
      (item ->> 'cantidad_medida')::numeric,
      (item ->> 'precio_unitario')::numeric,
      coalesce((item ->> 'descuento_monto')::numeric, 0),
      (item ->> 'calificacion')::numeric,
      v_usuario
    from jsonb_array_elements(p_items) as item;
  end if;

  return v_id;
end $$;

grant  execute on function public.guardar_transaccion(jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.guardar_transaccion(jsonb, jsonb, uuid) from public;

-- Si no hay ninguna principal, la de mayor saldo es la candidata natural.
-- Se deja marcada la primera cuenta creada, y se puede cambiar desde la app.
do $$
declare v_id uuid;
begin
  if not exists (select 1 from public.fuentes_cuentas where es_principal) then
    select id into v_id from public.fuentes_cuentas order by created_at asc limit 1;
    if v_id is not null then
      update public.fuentes_cuentas set es_principal = true where id = v_id;
      raise notice 'Cuenta principal asignada por defecto: %', v_id;
    end if;
  end if;
end $$;

commit;


-- ============================================================
-- 0015_presupuestos.sql
-- ============================================================
-- 0014 - Limite de gasto mensual
--
-- Se guarda como un MONTO FIJO, no como un porcentaje de los ingresos. Es la
-- diferencia que importa: si el limite dependiera de lo que entra, un traspaso
-- entre cuentas propias o un ingreso atipico lo subirian solo, y la referencia
-- se perderia justo el mes en que mas falta hace.
--
-- Como las transferencias son su propio tipo desde 0013, no cuentan como
-- gasto ni como ingreso, asi que mover plata entre tus cuentas no mueve el
-- avance del presupuesto.
--
-- Hay un limite global (categoria_id nulo) y, opcionalmente, limites por
-- categoria. El historico se conserva: cambiar el limite en marzo no reescribe
-- lo que regia en enero, porque cada uno vale desde su fecha.

begin;

create table if not exists public.presupuestos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  categoria_id  uuid references public.categorias(id) on delete cascade,
  monto         numeric not null,
  vigente_desde date not null default date_trunc('month', current_date)::date,
  created_at    timestamptz not null default now(),

  constraint chk_presupuesto_monto check (monto >= 0)
);

-- Un solo limite global por fecha, y uno por categoria y fecha. Se usan dos
-- indices parciales porque un UNIQUE normal trataria cada NULL como distinto
-- y dejaria meter limites globales duplicados.
create unique index if not exists uq_presupuesto_global
  on public.presupuestos (user_id, vigente_desde)
  where categoria_id is null;

create unique index if not exists uq_presupuesto_categoria
  on public.presupuestos (user_id, categoria_id, vigente_desde)
  where categoria_id is not null;

alter table public.presupuestos enable row level security;
alter table public.presupuestos force row level security;
drop policy if exists presupuestos_propios on public.presupuestos;
create policy presupuestos_propios on public.presupuestos
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.presupuestos from anon;

-- ------------------------------------------------- Avance y proyeccion
-- Devuelve, para un mes: cuanto se lleva gastado, cual es el limite vigente,
-- y a que ritmo se va.
--
-- La proyeccion solo tiene sentido en el mes en curso: en un mes ya cerrado
-- lo gastado ya es definitivo, asi que se devuelve ese mismo numero en vez de
-- una extrapolacion sin sentido.
create or replace function public.avance_presupuesto(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  limite            numeric,
  gastado           numeric,
  dias_transcurridos int,
  dias_del_mes      int,
  proyeccion        numeric,
  es_mes_en_curso   boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      date_trunc('month', p_mes)::date                                                as mes_inicio,
      (date_trunc('month', p_mes) + interval '1 month')::date                         as mes_siguiente,
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                       as inicio_ts,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin_ts,
      -- "Hoy" en la zona del usuario, no en la del servidor.
      (now() at time zone p_tz)::date                                                 as hoy
    from (select 1) _
  ),
  datos as (
    select
      l.*,
      (l.mes_siguiente - l.mes_inicio)                                as dias_mes,
      (l.hoy >= l.mes_inicio and l.hoy < l.mes_siguiente)             as en_curso,
      coalesce((
        select p.monto
        from public.presupuestos p
        where p.categoria_id is null
          and p.vigente_desde <= l.mes_inicio
        order by p.vigente_desde desc
        limit 1
      ), 0) as limite,
      coalesce((
        select sum(t.monto)
        from public.transacciones t
        where t.tipo = 'egreso'
          and t.fecha >= l.inicio_ts
          and t.fecha <  l.fin_ts
      ), 0) as gastado
    from limites l
  )
  select
    d.limite,
    d.gastado,
    case when d.en_curso then greatest((d.hoy - d.mes_inicio) + 1, 1) else d.dias_mes end,
    d.dias_mes,
    case
      when not d.en_curso then d.gastado
      when (d.hoy - d.mes_inicio) + 1 <= 0 then d.gastado
      else round(d.gastado / greatest((d.hoy - d.mes_inicio) + 1, 1) * d.dias_mes, 0)
    end,
    d.en_curso
  from datos d;
$$;

grant  execute on function public.avance_presupuesto(date, text) to authenticated;
revoke execute on function public.avance_presupuesto(date, text) from public;

commit;


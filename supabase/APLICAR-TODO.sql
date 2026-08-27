-- =====================================================================
-- FINANZAPP — TODAS LAS MIGRACIONES, EN ORDEN
--
-- Generado a partir de supabase/migrations/. Sirve para levantar una base
-- desde cero: pégalo completo en el SQL editor y ejecútalo una vez.
--
-- Si ya aplicaste migraciones antes, corre SOLO los archivos nuevos desde
-- supabase/migrations/ en vez de este archivo.
--
-- ANTES DE CORRER ESTO:
--   1. Tu cuenta debe existir ya en Authentication → Users.
--      La migración 0001 aborta si hay 0 usuarios o más de 1.
--   2. Debes tener un backup local (backups/<stamp>/).
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla, ese bloque se revierte
-- entero. Todos son seguros de volver a correr.
-- =====================================================================


-- ============================================================
-- 0001_user_ownership.sql
-- ============================================================
-- 0001 — Propiedad por usuario
--
-- Añade user_id a las 5 tablas con datos, rellena las filas existentes con el
-- único usuario de auth.users y luego lo vuelve obligatorio.
--
-- REQUISITO: tu cuenta ya debe existir en auth.users (regístrate en la app
-- primero). La migración se niega a correr si hay 0 o más de 1 usuario, para
-- no adjudicarle tus datos a la cuenta equivocada.
--
-- Idempotente: se puede correr dos veces sin daño.

begin;

do $$
declare
  v_user_id uuid;
  v_count   int;
begin
  select count(*) into v_count from auth.users;

  if v_count = 0 then
    raise exception 'No hay usuarios en auth.users. Regístrate en la app antes de correr esta migración.';
  elsif v_count > 1 then
    raise exception 'Hay % usuarios en auth.users. Esta migración asume uno solo; asigna user_id a mano.', v_count;
  end if;

  select id into v_user_id from auth.users;
  raise notice 'Adjudicando los datos existentes al usuario %', v_user_id;

  -- Columna + backfill, tabla por tabla.
  alter table public.fuentes_cuentas add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.transacciones   add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.items_detalle   add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.ajustes_saldos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
  alter table public.categorias      add column if not exists user_id uuid references auth.users(id) on delete cascade;

  update public.fuentes_cuentas set user_id = v_user_id where user_id is null;
  update public.transacciones   set user_id = v_user_id where user_id is null;
  update public.items_detalle   set user_id = v_user_id where user_id is null;
  update public.ajustes_saldos  set user_id = v_user_id where user_id is null;
  update public.categorias      set user_id = v_user_id where user_id is null;

  -- Recién ahora es seguro exigirlo.
  alter table public.fuentes_cuentas alter column user_id set not null;
  alter table public.transacciones   alter column user_id set not null;
  alter table public.items_detalle   alter column user_id set not null;
  alter table public.ajustes_saldos  alter column user_id set not null;
  alter table public.categorias      alter column user_id set not null;

  -- Valor por defecto para inserciones futuras desde la app.
  alter table public.fuentes_cuentas alter column user_id set default auth.uid();
  alter table public.transacciones   alter column user_id set default auth.uid();
  alter table public.items_detalle   alter column user_id set default auth.uid();
  alter table public.ajustes_saldos  alter column user_id set default auth.uid();
  alter table public.categorias      alter column user_id set default auth.uid();
end $$;

create index if not exists idx_fuentes_user       on public.fuentes_cuentas (user_id);
create index if not exists idx_transacciones_user on public.transacciones   (user_id, fecha desc);
create index if not exists idx_items_user         on public.items_detalle   (user_id);
create index if not exists idx_ajustes_user       on public.ajustes_saldos  (user_id);
create index if not exists idx_categorias_user    on public.categorias      (user_id);

commit;


-- ============================================================
-- 0002_rls.sql
-- ============================================================
-- 0002 — Row Level Security
--
-- Antes de esto, la anon key incrustada en el bundle podía leer y escribir
-- TODA la contabilidad sin iniciar sesión. Verificado empíricamente.
--
-- Después de esto, sin sesión válida las 5 tablas devuelven 0 filas.
--
-- Requiere 0001 aplicado (user_id NOT NULL en todas).

begin;

alter table public.fuentes_cuentas enable row level security;
alter table public.transacciones   enable row level security;
alter table public.items_detalle   enable row level security;
alter table public.ajustes_saldos  enable row level security;
alter table public.categorias      enable row level security;

-- Nadie puede saltarse RLS, ni siquiera el dueño de la tabla.
alter table public.fuentes_cuentas force row level security;
alter table public.transacciones   force row level security;
alter table public.items_detalle   force row level security;
alter table public.ajustes_saldos  force row level security;
alter table public.categorias      force row level security;

-- Una política por tabla que cubre SELECT/INSERT/UPDATE/DELETE.
-- `using` filtra lo que se puede ver o tocar; `with check` impide escribir
-- filas ajenas.
do $$
declare t text;
begin
  foreach t in array array[
    'fuentes_cuentas','transacciones','items_detalle','ajustes_saldos','categorias'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_propias', t);
    execute format($f$
      create policy %I on public.%I
        for all
        to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, t || '_propias', t);
  end loop;
end $$;

-- El rol anónimo no tiene nada que hacer aquí.
revoke all on public.fuentes_cuentas, public.transacciones, public.items_detalle,
               public.ajustes_saldos, public.categorias
  from anon;

commit;


-- ============================================================
-- 0003_integridad.sql
-- ============================================================
-- 0003 — Integridad referencial y constraints
--
-- Todos los CHECK y FK de este archivo fueron validados contra los datos
-- reales antes de escribirlos: 0 violaciones en 91 transacciones, 96 ítems,
-- 3 fuentes, 17 categorías y 2 ajustes.
--
-- Resuelve, entre otras cosas, que hoy el borrado de una transacción sean dos
-- requests sin transacción: si falla el segundo quedan ítems huérfanos.

begin;

-- ---------------------------------------------------------------- FKs
-- Se añaden solo si no existen ya, y con la regla de borrado correcta.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- tabla,          constraint,                  columna,          destino,               regla
      ('items_detalle',  'fk_items_transaccion',      'transaccion_id', 'transacciones(id)',   'cascade'),
      ('items_detalle',  'fk_items_categoria',        'categoria_id',   'categorias(id)',      'set null'),
      ('transacciones',  'fk_transacciones_fuente',   'fuente_id',      'fuentes_cuentas(id)', 'set null'),
      ('ajustes_saldos', 'fk_ajustes_fuente',         'fuente_id',      'fuentes_cuentas(id)', 'cascade'),
      ('categorias',     'fk_categorias_parent',      'parent_id',      'categorias(id)',      'cascade')
    ) as v(tabla, nombre, columna, destino, regla)
  loop
    -- Suelta cualquier FK preexistente sobre esa columna: la queremos con
    -- nuestra regla de borrado, no con la que dejó el editor de Supabase.
    execute (
      select coalesce(string_agg(format('alter table public.%I drop constraint %I;', r.tabla, con.conname), ' '), '')
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_attribute at on at.attrelid = cl.oid and at.attnum = any(con.conkey)
      where con.contype = 'f'
        and cl.relname = r.tabla
        and at.attname = r.columna
    );

    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.%s on delete %s',
      r.tabla, r.nombre, r.columna, r.destino, r.regla
    );
  end loop;
end $$;

-- ------------------------------------------------------------- CHECKs
alter table public.transacciones drop constraint if exists chk_transacciones_tipo;
alter table public.transacciones add  constraint chk_transacciones_tipo
  check (tipo in ('ingreso', 'egreso'));

alter table public.transacciones drop constraint if exists chk_transacciones_monto;
alter table public.transacciones add  constraint chk_transacciones_monto
  check (monto >= 0);

alter table public.items_detalle drop constraint if exists chk_items_unidades;
alter table public.items_detalle add  constraint chk_items_unidades
  check (unidades is null or unidades > 0);

alter table public.items_detalle drop constraint if exists chk_items_calificacion;
alter table public.items_detalle add  constraint chk_items_calificacion
  check (calificacion is null or calificacion between 1 and 5);

alter table public.items_detalle drop constraint if exists chk_items_precio;
alter table public.items_detalle add  constraint chk_items_precio
  check (precio_unitario is null or precio_unitario >= 0);

-- Los constraints de descuento NO van aquí: en 0004 esas columnas pasan a ser
-- generadas, con `descuento_monto` como única fuente de verdad.

-- --------------------------------------------- Guarda de ciclos en el árbol
-- Nada impedía hoy que una categoría fuera su propia ancestra, lo que colgaría
-- cualquier recorrido del árbol.
create or replace function public.categorias_sin_ciclos()
returns trigger
language plpgsql
as $$
declare
  v_actual uuid := new.parent_id;
  v_saltos int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Una categoría no puede ser su propio padre.';
  end if;

  while v_actual is not null loop
    v_saltos := v_saltos + 1;
    if v_saltos > 64 then
      raise exception 'Jerarquía de categorías demasiado profunda o cíclica.';
    end if;

    select parent_id into v_actual from public.categorias where id = v_actual;

    if v_actual = new.id then
      raise exception 'Ciclo detectado: la categoría % quedaría bajo sí misma.', new.id;
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_categorias_sin_ciclos on public.categorias;
create trigger trg_categorias_sin_ciclos
  before insert or update of parent_id on public.categorias
  for each row execute function public.categorias_sin_ciclos();

-- ------------------------------------------------------------- Índices
create index if not exists idx_items_transaccion on public.items_detalle  (transaccion_id);
create index if not exists idx_items_categoria   on public.items_detalle  (categoria_id);
create index if not exists idx_ajustes_fuente    on public.ajustes_saldos (fuente_id, fecha_referencia desc);
create index if not exists idx_categorias_parent on public.categorias     (parent_id);

commit;


-- ============================================================
-- 0004_descuentos_y_precios.sql
-- ============================================================
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


-- ============================================================
-- 0005_gasto_sin_detalle.sql
-- ============================================================
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


-- ============================================================
-- 0006_saldos_rpc.sql
-- ============================================================
-- 0006 — Cálculo de saldos en la base de datos
--
-- Hoy `useFuentes` descarga TODAS las transacciones (sin filtro ni límite) y
-- recalcula los saldos en el navegador en cada render del Dashboard. Con 91
-- filas se nota poco; crece linealmente para siempre.
--
-- Estas funciones replican EXACTAMENTE la regla actual
-- (src/hooks/useFuentes.js:19-45):
--
--   1. Se toma el último ajuste de la fuente con fecha_referencia anterior al
--      mes siguiente al consultado.
--   2. Ese ajuste define el saldo inicial y la fecha base.
--   3. Sin ajuste: saldo inicial 0 y fecha base 2020-01-01.
--   4. Se suman los ingresos y se restan los egresos desde la fecha base hasta
--      el fin del mes consultado.
--
-- La zona horaria es explícita: la versión JS usaba constructores Date en hora
-- local, lo que hacía que el resultado dependiera de la máquina.
--
-- security invoker => RLS aplica: cada quien ve solo lo suyo.

begin;

create or replace function public.saldos_por_fuente(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  fuente_id     uuid,
  nombre        text,
  tipo          text,
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
    coalesce(u.monto_ajustado, 0)::numeric as saldo_inicial,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(case when t.tipo = 'ingreso' then t.monto else -t.monto end)
          from public.transacciones t
          cross join limites l2
          where t.fuente_id = f.id
            and t.fecha >= coalesce(
                  (u.fecha_referencia::timestamp at time zone p_tz),
                  ('2020-01-01 00:00:00'::timestamp at time zone p_tz)
                )
            and t.fecha < l2.corte_ts
        ), 0)
    )::numeric as saldo_actual
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.nombre;
$$;

create or replace function public.resumen_mensual(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  total_disponible numeric,
  ingresos         numeric,
  gastos           numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                        as inicio_ts,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin_ts
  )
  select
    (select coalesce(sum(s.saldo_actual), 0) from public.saldos_por_fuente(p_mes, p_tz) s),
    coalesce((
      select sum(t.monto) from public.transacciones t, limites l
      where t.tipo = 'ingreso' and t.fecha >= l.inicio_ts and t.fecha < l.fin_ts
    ), 0),
    coalesce((
      select sum(t.monto) from public.transacciones t, limites l
      where t.tipo = 'egreso' and t.fecha >= l.inicio_ts and t.fecha < l.fin_ts
    ), 0);
$$;

grant execute on function public.saldos_por_fuente(date, text) to authenticated;
grant execute on function public.resumen_mensual(date, text)   to authenticated;

revoke execute on function public.saldos_por_fuente(date, text) from anon;
revoke execute on function public.resumen_mensual(date, text)   from anon;

commit;


-- ============================================================
-- 0007_guardar_transaccion.sql
-- ============================================================
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


-- ============================================================
-- 0008_cerrar_huecos.sql
-- ============================================================
-- 0008 — Cerrar los huecos que dejó 0002
--
-- Dos cosas que se escaparon y que se detectaron sondeando la base ya migrada
-- con la anon key, sin sesión:
--
-- 1. `uso_productos` seguía devolviendo HTTP 200. La migración 0002 activó RLS
--    en las cinco tablas con datos y esa quedó fuera. Tiene 0 filas y la app
--    nunca la usó (existía `createUsage()` pero no había ni una llamada), así
--    que no se filtraba nada — pero era un destino de escritura abierto para
--    cualquiera que sacara la anon key del bundle, que es público por diseño.
--
-- 2. En Postgres, CREATE FUNCTION concede EXECUTE a PUBLIC por defecto. Los
--    `revoke execute ... from anon` de 0006 y 0007 no quitaban esa concesión:
--    hay que revocar de PUBLIC. El acceso ya estaba bloqueado por los permisos
--    de tabla, así que esto es una segunda línea, no la única.

begin;

-- ------------------------------------------------- uso_productos
-- Se elimina en vez de protegerse: 0 filas, ninguna lectura en el código, y
-- una tabla que nadie usa es una superficie de ataque sin contrapartida.
-- Si algún día se necesita registrar uso de productos, se crea de nuevo con
-- RLS desde el principio.
drop table if exists public.uso_productos;

-- ------------------------------------------- EXECUTE de las funciones
revoke execute on function public.saldos_por_fuente(date, text)              from public;
revoke execute on function public.resumen_mensual(date, text)                from public;
revoke execute on function public.guardar_transaccion(jsonb, jsonb, uuid)    from public;
revoke execute on function public.borrar_transaccion(uuid)                   from public;

grant execute on function public.saldos_por_fuente(date, text)               to authenticated;
grant execute on function public.resumen_mensual(date, text)                 to authenticated;
grant execute on function public.guardar_transaccion(jsonb, jsonb, uuid)     to authenticated;
grant execute on function public.borrar_transaccion(uuid)                    to authenticated;

-- --------------------------------------------------- Red de seguridad
-- Si en el futuro se crea una tabla y se olvida activarle RLS, esto lo dice
-- en voz alta al correr las migraciones en vez de dejarlo pasar en silencio.
do $$
declare
  v_sin_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into v_sin_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_sin_rls is not null then
    raise warning 'Tablas en public SIN row level security: %', v_sin_rls;
  else
    raise notice 'Todas las tablas de public tienen RLS activo.';
  end if;
end $$;

commit;


-- ============================================================
-- 0009_resumen_sin_duplicar.sql
-- ============================================================
-- 0009 — Dejar de calcular los saldos dos veces por carga del dashboard
--
-- Cómo estaba: el dashboard llamaba a `saldos_por_fuente` para pintar cada
-- fuente y, por separado, a `resumen_mensual` para las tarjetas de arriba.
-- Pero `resumen_mensual` calculaba `total_disponible` llamando internamente a
-- `saldos_por_fuente` otra vez. Resultado: dos viajes de red y el cálculo
-- completo de saldos ejecutado dos veces para pintar una sola pantalla.
--
-- El arreglo: `resumen_mensual` deja de devolver `total_disponible` y se queda
-- con lo que solo ella sabe hacer (ingresos y gastos del mes, dos sumas
-- baratas). El total disponible lo suma el cliente a partir de las filas que
-- ya recibió de `saldos_por_fuente`: son tres números.
--
-- Cambiar las columnas que devuelve una función exige soltarla y recrearla;
-- CREATE OR REPLACE no permite alterar el tipo de retorno.

begin;

drop function if exists public.resumen_mensual(date, text);

create function public.resumen_mensual(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  ingresos numeric,
  gastos   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                        as inicio_ts,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin_ts
  )
  select
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric
  from public.transacciones t, limites l
  where t.fecha >= l.inicio_ts
    and t.fecha <  l.fin_ts;
$$;

grant  execute on function public.resumen_mensual(date, text) to authenticated;
revoke execute on function public.resumen_mensual(date, text) from public;

commit;


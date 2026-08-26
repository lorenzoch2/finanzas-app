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

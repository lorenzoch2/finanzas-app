-- =====================================================================
-- FINANZAPP v3 - MIGRACIONES PENDIENTES (0016 a 0018)
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
--   0016  Agregaciones para la vista de analisis.
--   0017  Presupuestos por periodo libre y por cuenta. Migra el limite
--         mensual que hubiera al periodo equivalente.
--   0018  Todas las consultas pasan a recibir un rango de fechas en vez de
--         un mes. El mes deja de estar incrustado y pasa a ser el rango mas
--         habitual, no el unico posible.
--
-- Solo 0017 toca datos, y solo para trasladar el limite mensual anterior a
-- su periodo equivalente. El resto crea o reemplaza funciones.
--
-- IMPORTANTE: aplicalo junto con la version desplegada de la app. Las
-- funciones cambian de firma, asi que una version antigua dejaria de
-- encontrarlas.
--
-- Cada bloque va entre BEGIN/COMMIT: si uno falla se revierte entero.
-- =====================================================================

-- ============================================================
-- 0016_analisis.sql
-- ============================================================
-- 0016 - Agregaciones para la vista de analisis
--
-- Todo el calculo vive en la base y no en el navegador. La alternativa seria
-- bajar doce meses de transacciones con su detalle y agrupar en el telefono,
-- que es exactamente el error que tenia la version original con los saldos:
-- descargaba el historial completo en cada render.
--
-- Las transferencias quedan fuera de todos los totales: mover plata entre
-- cuentas propias no es gasto ni ingreso, y contarlas inflaria cada grafico.

begin;

-- ------------------------------------------------- Gasto por categoria
-- Devuelve la subcategoria y su categoria principal, para poder agrupar por
-- cualquiera de las dos sin consultar dos veces.
--
-- IMPORTANTE: incluye el gasto NO detallado.
--
-- Partir solo de items_detalle dejaria fuera todo egreso registrado sin
-- desglose, y eso hoy es el 20% del dinero: 23 de 72 egresos, $305.107. Un
-- grafico que se come una quinta parte del gasto sin avisar es peor que no
-- tener grafico, porque invita a concluir cosas falsas sobre el resto.
--
-- El resto no detallado aparece como su propia barra, asi que la suma del
-- grafico cuadra con el total del mes en vez de quedarse corta en silencio.
create or replace function public.gasto_por_categoria(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  categoria_padre text,
  categoria       text,
  total           numeric,
  items           bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                        as inicio,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz)  as fin
  ),
  detallado as (
    select
      coalesce(padre.nombre, U&'Sin categor\00EDa') as categoria_padre,
      coalesce(cat.nombre, U&'Sin categor\00EDa')   as categoria,
      sum(i.total_linea)::numeric             as total,
      count(*)::bigint                        as items
    from public.items_detalle i
    join public.transacciones t on t.id = i.transaccion_id
    cross join limites l
    left join public.categorias cat   on cat.id = i.categoria_id
    left join public.categorias padre on padre.id = cat.parent_id
    where t.tipo = 'egreso'
      and t.fecha >= l.inicio
      and t.fecha <  l.fin
    group by 1, 2
    having sum(i.total_linea) > 0
  ),
  -- Lo que cada egreso tiene por encima de lo que suman sus items: cubre
  -- tanto las compras sin desglose como el remanente de una boleta
  -- detallada solo en parte.
  resto as (
    select
      'Sin detalle'::text as categoria_padre,
      'Sin detalle'::text as categoria,
      sum(greatest(t.monto - coalesce(d.suma, 0), 0))::numeric as total,
      count(*)::bigint as items
    from public.transacciones t
    cross join limites l
    left join (
      select transaccion_id, sum(total_linea) as suma
      from public.items_detalle
      group by transaccion_id
    ) d on d.transaccion_id = t.id
    where t.tipo = 'egreso'
      and t.fecha >= l.inicio
      and t.fecha <  l.fin
      and greatest(t.monto - coalesce(d.suma, 0), 0) > 0
  )
  select * from detallado
  union all
  select * from resto where total > 0
  order by 3 desc;
$$;

-- ---------------------------------------------------- Evolucion mensual
-- Los ultimos N meses con sus ingresos, gastos y el limite que regia entonces.
-- El limite se toma del presupuesto vigente en cada mes, no del actual: si se
-- cambio en marzo, enero debe seguir comparandose con el suyo.
create or replace function public.evolucion_mensual(
  p_meses int  default 12,
  p_tz    text default 'America/Santiago'
)
returns table (
  mes      date,
  ingresos numeric,
  gastos   numeric,
  limite   numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with meses as (
    select generate_series(
      date_trunc('month', (now() at time zone p_tz)::date) - ((p_meses - 1) || ' months')::interval,
      date_trunc('month', (now() at time zone p_tz)::date),
      interval '1 month'
    )::date as mes
  )
  select
    m.mes,
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric,
    coalesce((
      select p.monto from public.presupuestos p
      where p.categoria_id is null and p.vigente_desde <= m.mes
      order by p.vigente_desde desc limit 1
    ), 0)::numeric
  from meses m
  left join public.transacciones t
    on t.fecha >= (m.mes::timestamp at time zone p_tz)
   and t.fecha <  ((m.mes + interval '1 month')::timestamp at time zone p_tz)
   and t.tipo in ('ingreso', 'egreso')
  group by m.mes
  order by m.mes;
$$;

-- ----------------------------------------------- Gasto por establecimiento
create or replace function public.gasto_por_establecimiento(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  establecimiento text,
  tipo            text,
  total           numeric,
  visitas         bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                       as inicio,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    coalesce(e.tipo, 'otro'),
    sum(t.monto)::numeric,
    count(*)::bigint
  from public.transacciones t
  cross join limites l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso'
    and t.fecha >= l.inicio
    and t.fecha <  l.fin
  group by 1, 2
  order by 3 desc;
$$;

-- ------------------------------------------- Historial de un producto
-- Cada compra de un producto, con su precio y donde se compro. Es la base
-- para responder "donde me sale mas barato?" y "cuanto ha subido?".
--
-- El precio por unidad de medida solo tiene sentido si el producto declara su
-- contenido; si no, se devuelve nulo en vez de un numero inventado.
create or replace function public.historial_producto(
  p_producto_id uuid
)
returns table (
  fecha            timestamptz,
  establecimiento  text,
  precio_unitario  numeric,
  precio_final     numeric,
  cantidad         numeric,
  precio_por_medida numeric,
  unidad_medida    text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.fecha,
    coalesce(e.nombre, 'Sin especificar'),
    i.precio_unitario,
    i.precio_final,
    coalesce(i.cantidad_medida, i.unidades, 1),
    case
      -- A granel el precio ya viene por kilo.
      when p.vendido_por = 'peso' then i.precio_final
      when p.contenido_cantidad is null or p.contenido_cantidad = 0 then null
      -- Se normaliza a kilo y litro para que 500 g y 1 kg sean comparables.
      when p.contenido_unidad = 'g'  then i.precio_final / (p.contenido_cantidad / 1000)
      when p.contenido_unidad = 'ml' then i.precio_final / (p.contenido_cantidad / 1000)
      else i.precio_final / p.contenido_cantidad
    end::numeric,
    case
      when p.vendido_por = 'peso' then 'kg'
      when p.contenido_unidad in ('g', 'kg') then 'kg'
      when p.contenido_unidad in ('ml', 'l') then 'L'
      when p.contenido_unidad = 'unidad' then 'unidad'
      else null
    end
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  join public.productos p     on p.id = i.producto_id
  left join public.establecimientos e on e.id = t.establecimiento_id
  where i.producto_id = p_producto_id
  order by t.fecha;
$$;

-- -------------------------------------------------- Ranking de productos
create or replace function public.ranking_productos(
  p_mes    date,
  p_tz     text default 'America/Santiago',
  p_limite int  default 15
)
returns table (
  producto     text,
  marca        text,
  total        numeric,
  veces        bigint,
  calificacion numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                       as inicio,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin
  )
  select
    coalesce(p.nombre, i.nombre_producto, 'Sin nombre'),
    coalesce(p.marca, i.marca),
    sum(i.total_linea)::numeric,
    count(*)::bigint,
    avg(i.calificacion)::numeric
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join limites l
  left join public.productos p on p.id = i.producto_id
  where t.tipo = 'egreso'
    and t.fecha >= l.inicio
    and t.fecha <  l.fin
  group by 1, 2
  order by 3 desc
  limit p_limite;
$$;

-- --------------------------------------------- Ahorro por descuentos
create or replace function public.ahorro_descuentos(
  p_mes date,
  p_tz  text default 'America/Santiago'
)
returns table (
  establecimiento text,
  ahorrado        numeric,
  items           bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with limites as (
    select
      (date_trunc('month', p_mes)::timestamp at time zone p_tz)                       as inicio,
      ((date_trunc('month', p_mes) + interval '1 month')::timestamp at time zone p_tz) as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    sum(i.descuento_monto * coalesce(i.unidades, 1))::numeric,
    count(*)::bigint
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join limites l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso'
    and i.descuento_monto > 0
    and t.fecha >= l.inicio
    and t.fecha <  l.fin
  group by 1
  order by 2 desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'gasto_por_categoria(date, text)',
    'evolucion_mensual(int, text)',
    'gasto_por_establecimiento(date, text)',
    'historial_producto(uuid)',
    'ranking_productos(date, text, int)',
    'ahorro_descuentos(date, text)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
    execute format('revoke execute on function public.%s from public', f);
  end loop;
end $$;

commit;


-- ============================================================
-- 0017_presupuestos_por_periodo.sql
-- ============================================================
-- 0017 - Presupuestos por periodo y por fuente
--
-- Lo que habia: un limite mensual global. Servia para "este mes no gasto mas
-- de X", pero no para "entre el 1 y el 15 de diciembre, para los regalos, solo
-- puedo gastar Y con la tarjeta".
--
-- Tres cosas cambian:
--
--   1. PERIODO LIBRE. En vez de un mes implicito, fecha de inicio y fecha de
--      fin. Un mes sigue siendo el caso normal, pero ahora es un periodo mas,
--      no una limitacion del modelo.
--
--   2. FUENTES. Un presupuesto puede aplicar a todas las cuentas o solo a
--      algunas. Sin fuentes asociadas significa "todas", que es lo que ya
--      valia y evita tener que enumerarlas para el caso habitual.
--
--   3. NOMBRE. Con varios presupuestos a la vez hay que poder distinguirlos.
--
-- Los presupuestos pueden solaparse a proposito: un tope mensual general y uno
-- acotado para un viaje son dos limites reales que conviven, y la app muestra
-- el avance de cada uno.

begin;

alter table public.presupuestos
  add column if not exists nombre        text,
  add column if not exists fecha_inicio  date,
  add column if not exists fecha_fin     date;

-- Migrar lo que hubiera: `vigente_desde` era el primer dia de un mes, asi que
-- el periodo equivalente es ese mes completo.
update public.presupuestos
set
  fecha_inicio = coalesce(fecha_inicio, vigente_desde),
  fecha_fin    = coalesce(fecha_fin, (vigente_desde + interval '1 month' - interval '1 day')::date),
  nombre       = coalesce(nombre, U&'L\00EDmite de ' || to_char(vigente_desde, 'TMMonth YYYY'))
where vigente_desde is not null;

-- Para filas sin `vigente_desde` (no deberia haber ninguna) se usa el mes en curso.
update public.presupuestos
set
  fecha_inicio = coalesce(fecha_inicio, date_trunc('month', current_date)::date),
  fecha_fin    = coalesce(fecha_fin, (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date),
  nombre       = coalesce(nombre, U&'L\00EDmite')
where fecha_inicio is null or fecha_fin is null or nombre is null;

alter table public.presupuestos
  alter column nombre       set not null,
  alter column fecha_inicio set not null,
  alter column fecha_fin    set not null;

alter table public.presupuestos drop constraint if exists chk_presupuesto_periodo;
alter table public.presupuestos add  constraint chk_presupuesto_periodo
  check (fecha_fin >= fecha_inicio);

-- Los indices unicos anteriores asumian un limite por mes y categoria. Con
-- periodos libres y solapamiento intencionado ya no aplican.
drop index if exists public.uq_presupuesto_global;
drop index if exists public.uq_presupuesto_categoria;

-- `vigente_desde` deja de usarse. Se conserva la columna por si hiciera falta
-- reconstruir algo, pero sin obligar a rellenarla.
alter table public.presupuestos alter column vigente_desde drop not null;

create index if not exists idx_presupuestos_periodo
  on public.presupuestos (user_id, fecha_inicio, fecha_fin);

-- --------------------------------------------------- Fuentes del presupuesto
-- Sin filas para un presupuesto = aplica a todas las cuentas. Es la
-- convencion que evita tener que enumerar las tres fuentes para el caso
-- normal, que es justamente "todas".
create table if not exists public.presupuesto_fuentes (
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  fuente_id      uuid not null references public.fuentes_cuentas(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (presupuesto_id, fuente_id)
);

create index if not exists idx_presupuesto_fuentes_fuente
  on public.presupuesto_fuentes (fuente_id);

alter table public.presupuesto_fuentes enable row level security;
alter table public.presupuesto_fuentes force row level security;
drop policy if exists presupuesto_fuentes_propias on public.presupuesto_fuentes;
create policy presupuesto_fuentes_propias on public.presupuesto_fuentes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.presupuesto_fuentes from anon;

-- ------------------------------------------------ Avance de los presupuestos
-- Devuelve TODOS los presupuestos que tocan la fecha de referencia, con su
-- avance. Antes devolvia un unico numero mensual; ahora pueden convivir
-- varios, y cada uno se mide contra su propio periodo y sus propias fuentes.
drop function if exists public.avance_presupuesto(date, text);

create or replace function public.avance_presupuestos(
  p_referencia date default current_date,
  p_tz         text default 'America/Santiago'
)
returns table (
  id                 uuid,
  nombre             text,
  monto              numeric,
  fecha_inicio       date,
  fecha_fin          date,
  categoria          text,
  fuentes            text,
  gastado            numeric,
  dias_transcurridos int,
  dias_totales       int,
  proyeccion         numeric,
  esta_activo        boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      p.id,
      p.nombre,
      p.monto,
      p.fecha_inicio,
      p.fecha_fin,
      c.nombre as categoria,
      p.categoria_id,
      (p.fecha_fin - p.fecha_inicio) + 1                                   as dias_totales,
      (p_referencia between p.fecha_inicio and p.fecha_fin)                as esta_activo,
      (p.fecha_inicio::timestamp at time zone p_tz)                        as inicio_ts,
      ((p.fecha_fin + 1)::timestamp at time zone p_tz)                     as fin_ts
    from public.presupuestos p
    left join public.categorias c on c.id = p.categoria_id
    where p_referencia between p.fecha_inicio and p.fecha_fin
  ),
  gasto as (
    select
      b.id,
      coalesce(sum(t.monto), 0)::numeric as gastado
    from base b
    left join public.transacciones t
      on t.tipo = 'egreso'
     and t.fecha >= b.inicio_ts
     and t.fecha <  b.fin_ts
     -- Sin fuentes asociadas, el presupuesto vale para todas las cuentas.
     and (
       not exists (select 1 from public.presupuesto_fuentes pf where pf.presupuesto_id = b.id)
       or t.fuente_id in (
            select pf.fuente_id from public.presupuesto_fuentes pf where pf.presupuesto_id = b.id
          )
     )
     -- Un presupuesto por categoria solo cuenta los items de esa categoria o
     -- de sus subcategorias.
     and (
       b.categoria_id is null
       or exists (
            select 1
            from public.items_detalle i
            left join public.categorias sub on sub.id = i.categoria_id
            where i.transaccion_id = t.id
              and (i.categoria_id = b.categoria_id or sub.parent_id = b.categoria_id)
          )
     )
    group by b.id
  )
  select
    b.id,
    b.nombre,
    b.monto,
    b.fecha_inicio,
    b.fecha_fin,
    b.categoria,
    coalesce((
      select string_agg(f.nombre, ', ' order by f.nombre)
      from public.presupuesto_fuentes pf
      join public.fuentes_cuentas f on f.id = pf.fuente_id
      where pf.presupuesto_id = b.id
    ), 'Todas las cuentas'),
    g.gastado,
    -- Dias ya vividos del periodo. En uno cerrado, todos.
    case
      when p_referencia > b.fecha_fin then b.dias_totales
      when p_referencia < b.fecha_inicio then 0
      else (p_referencia - b.fecha_inicio) + 1
    end::int,
    b.dias_totales::int,
    -- La proyeccion solo tiene sentido mientras el periodo corre. En uno
    -- cerrado, lo gastado ya es definitivo.
    case
      when not b.esta_activo then g.gastado
      when (p_referencia - b.fecha_inicio) + 1 <= 0 then g.gastado
      else round(g.gastado / greatest((p_referencia - b.fecha_inicio) + 1, 1) * b.dias_totales, 0)
    end::numeric,
    b.esta_activo
  from base b
  join gasto g on g.id = b.id
  order by b.fecha_inicio desc, b.nombre;
$$;

grant  execute on function public.avance_presupuestos(date, text) to authenticated;
revoke execute on function public.avance_presupuestos(date, text) from public;

commit;


-- ============================================================
-- 0018_rangos_de_fecha.sql
-- ============================================================
-- 0018 - Todo por rango de fechas, no por mes
--
-- El mes deja de estar incrustado en las funciones y pasa a ser lo que
-- siempre debio ser: un rango como cualquier otro, el mas habitual. Asi
-- "diciembre", "los ultimos tres meses" y "del 3 al 17" son la misma consulta
-- con distintos extremos, en vez de tres caminos separados.
--
-- Las firmas cambian, asi que las funciones se sueltan y se recrean. Es
-- seguro tanto si la 0016 ya se aplico como si no.
--
-- Convencion: [p_desde, p_hasta] con AMBOS extremos incluidos. Un rango de un
-- solo dia es desde = hasta, que es lo que espera cualquiera que elija esa
-- fecha dos veces en un calendario. Internamente se traduce a
-- [inicio, fin+1) para poder comparar contra instantes.

begin;

-- ------------------------------------------------------------ Saldos
-- Antes recibia un mes y calculaba hasta su cierre. Ahora recibe la fecha de
-- corte directamente: el saldo "a fecha de".
drop function if exists public.saldos_por_fuente(date, text);

create function public.saldos_por_fuente(
  p_hasta date,
  p_tz    text default 'America/Santiago'
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
      (p_hasta + 1)                                        as dia_siguiente,
      ((p_hasta + 1)::timestamp at time zone p_tz)          as corte_ts
  ),
  ultimo_ajuste as (
    select distinct on (a.fuente_id)
      a.fuente_id, a.monto_ajustado, a.fecha_referencia
    from public.ajustes_saldos a
    cross join limites l
    where a.fecha_referencia < l.dia_siguiente
    order by a.fuente_id, a.fecha_referencia desc
  )
  select
    f.id, f.nombre, f.tipo, f.es_principal,
    coalesce(u.monto_ajustado, 0)::numeric,
    (
      coalesce(u.monto_ajustado, 0)
      + coalesce((
          select sum(
            case
              when t.tipo = 'ingreso'                                  then  t.monto
              when t.tipo = 'egreso'                                   then -t.monto
              when t.tipo = 'transferencia' and t.fuente_id = f.id      then -t.monto
              when t.tipo = 'transferencia' and t.fuente_destino_id = f.id then t.monto
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
    )::numeric
  from public.fuentes_cuentas f
  left join ultimo_ajuste u on u.fuente_id = f.id
  order by f.es_principal desc, f.nombre;
$$;

-- ----------------------------------------------------------- Resumen
drop function if exists public.resumen_mensual(date, text);

create function public.resumen_periodo(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (ingresos numeric, gastos numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric
  from public.transacciones t, l
  where t.fecha >= l.inicio and t.fecha < l.fin;
$$;

-- ------------------------------------------------- Gasto por categoria
-- Incluye el gasto NO detallado: partir solo de items_detalle dejaria fuera
-- todo egreso sin desglose, que hoy es una quinta parte del dinero. Un
-- grafico que se come el 20% sin avisar invita a conclusiones falsas sobre el
-- resto.
drop function if exists public.gasto_por_categoria(date, text);

create function public.gasto_por_categoria(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (categoria_padre text, categoria text, total numeric, items bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  ),
  detallado as (
    select
      coalesce(padre.nombre, U&'Sin categor\00EDa') as categoria_padre,
      coalesce(cat.nombre, U&'Sin categor\00EDa')   as categoria,
      sum(i.total_linea)::numeric             as total,
      count(*)::bigint                        as items
    from public.items_detalle i
    join public.transacciones t on t.id = i.transaccion_id
    cross join l
    left join public.categorias cat   on cat.id = i.categoria_id
    left join public.categorias padre on padre.id = cat.parent_id
    where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
    group by 1, 2
    having sum(i.total_linea) > 0
  ),
  resto as (
    -- Los alias son obligatorios: sin ellos las columnas de la CTE no tienen
    -- nombre y el `where total > 0` de abajo no encuentra a que referirse.
    select
      'Sin detalle'::text                                       as categoria_padre,
      'Sin detalle'::text                                       as categoria,
      sum(greatest(t.monto - coalesce(d.suma, 0), 0))::numeric  as total,
      count(*)::bigint                                          as items
    from public.transacciones t
    cross join l
    left join (
      select transaccion_id, sum(total_linea) as suma
      from public.items_detalle group by transaccion_id
    ) d on d.transaccion_id = t.id
    where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
      and greatest(t.monto - coalesce(d.suma, 0), 0) > 0
  )
  select * from detallado
  union all
  select * from resto where total > 0
  order by 3 desc;
$$;

-- --------------------------------------------------------- Evolucion
-- Sigue siendo mensual porque su pregunta es "como cambia mes a mes?", pero
-- ahora los meses salen del rango elegido en vez de ser siempre los ultimos N.
drop function if exists public.evolucion_mensual(int, text);

create function public.evolucion_mensual(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (mes date, ingresos numeric, gastos numeric, limite numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with meses as (
    select generate_series(
      date_trunc('month', p_desde),
      date_trunc('month', p_hasta),
      interval '1 month'
    )::date as mes
  )
  select
    m.mes,
    coalesce(sum(t.monto) filter (where t.tipo = 'ingreso'), 0)::numeric,
    coalesce(sum(t.monto) filter (where t.tipo = 'egreso'),  0)::numeric,
    -- El limite que regia ese mes, no el actual: cambiarlo hoy no debe
    -- reescribir con que se comparaba enero.
    coalesce((
      select p.monto from public.presupuestos p
      where p.categoria_id is null
        and p.fecha_inicio <= (m.mes + interval '1 month' - interval '1 day')::date
        and p.fecha_fin    >= m.mes
        and not exists (select 1 from public.presupuesto_fuentes pf where pf.presupuesto_id = p.id)
      order by p.fecha_inicio desc limit 1
    ), 0)::numeric
  from meses m
  left join public.transacciones t
    on t.fecha >= (m.mes::timestamp at time zone p_tz)
   and t.fecha <  ((m.mes + interval '1 month')::timestamp at time zone p_tz)
   and t.tipo in ('ingreso', 'egreso')
  group by m.mes
  order by m.mes;
$$;

-- ----------------------------------------------- Gasto por establecimiento
drop function if exists public.gasto_por_establecimiento(date, text);

create function public.gasto_por_establecimiento(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (establecimiento text, tipo text, total numeric, visitas bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    coalesce(e.tipo, 'otro'),
    sum(t.monto)::numeric,
    count(*)::bigint
  from public.transacciones t
  cross join l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1, 2
  order by 3 desc;
$$;

-- -------------------------------------------------- Ranking de productos
drop function if exists public.ranking_productos(date, text, int);

create function public.ranking_productos(
  p_desde  date,
  p_hasta  date,
  p_tz     text default 'America/Santiago',
  p_limite int  default 15
)
returns table (producto text, marca text, total numeric, veces bigint, calificacion numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(p.nombre, i.nombre_producto, 'Sin nombre'),
    coalesce(p.marca, i.marca),
    sum(i.total_linea)::numeric,
    count(*)::bigint,
    avg(i.calificacion)::numeric
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join l
  left join public.productos p on p.id = i.producto_id
  where t.tipo = 'egreso' and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1, 2
  order by 3 desc
  limit p_limite;
$$;

-- ------------------------------------------------ Ahorro por descuentos
drop function if exists public.ahorro_descuentos(date, text);

create function public.ahorro_descuentos(
  p_desde date,
  p_hasta date,
  p_tz    text default 'America/Santiago'
)
returns table (establecimiento text, ahorrado numeric, items bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with l as (
    select
      (p_desde::timestamp at time zone p_tz)       as inicio,
      ((p_hasta + 1)::timestamp at time zone p_tz)  as fin
  )
  select
    coalesce(e.nombre, 'Sin especificar'),
    sum(i.descuento_monto * coalesce(i.unidades, 1))::numeric,
    count(*)::bigint
  from public.items_detalle i
  join public.transacciones t on t.id = i.transaccion_id
  cross join l
  left join public.establecimientos e on e.id = t.establecimiento_id
  where t.tipo = 'egreso' and i.descuento_monto > 0
    and t.fecha >= l.inicio and t.fecha < l.fin
  group by 1
  order by 2 desc;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'saldos_por_fuente(date, text)',
    'resumen_periodo(date, date, text)',
    'gasto_por_categoria(date, date, text)',
    'evolucion_mensual(date, date, text)',
    'gasto_por_establecimiento(date, date, text)',
    'ranking_productos(date, date, text, int)',
    'ahorro_descuentos(date, date, text)'
  ] loop
    execute format('grant execute on function public.%s to authenticated', f);
    execute format('revoke execute on function public.%s from public', f);
  end loop;
end $$;

commit;


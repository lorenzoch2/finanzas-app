-- 0016 — Agregaciones para la vista de análisis
--
-- Todo el cálculo vive en la base y no en el navegador. La alternativa sería
-- bajar doce meses de transacciones con su detalle y agrupar en el teléfono,
-- que es exactamente el error que tenía la versión original con los saldos:
-- descargaba el historial completo en cada render.
--
-- Las transferencias quedan fuera de todos los totales: mover plata entre
-- cuentas propias no es gasto ni ingreso, y contarlas inflaría cada gráfico.

begin;

-- ------------------------------------------------- Gasto por categoría
-- Devuelve la subcategoría y su categoría principal, para poder agrupar por
-- cualquiera de las dos sin consultar dos veces.
--
-- IMPORTANTE: incluye el gasto NO detallado.
--
-- Partir solo de items_detalle dejaría fuera todo egreso registrado sin
-- desglose, y eso hoy es el 20% del dinero: 23 de 72 egresos, $305.107. Un
-- gráfico que se come una quinta parte del gasto sin avisar es peor que no
-- tener gráfico, porque invita a concluir cosas falsas sobre el resto.
--
-- El resto no detallado aparece como su propia barra, así que la suma del
-- gráfico cuadra con el total del mes en vez de quedarse corta en silencio.
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
      coalesce(padre.nombre, 'Sin categoría') as categoria_padre,
      coalesce(cat.nombre, 'Sin categoría')   as categoria,
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
  -- Lo que cada egreso tiene por encima de lo que suman sus ítems: cubre
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

-- ---------------------------------------------------- Evolución mensual
-- Los últimos N meses con sus ingresos, gastos y el límite que regía entonces.
-- El límite se toma del presupuesto vigente en cada mes, no del actual: si se
-- cambió en marzo, enero debe seguir comparándose con el suyo.
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
-- Cada compra de un producto, con su precio y dónde se compró. Es la base
-- para responder «¿dónde me sale más barato?» y «¿cuánto ha subido?».
--
-- El precio por unidad de medida solo tiene sentido si el producto declara su
-- contenido; si no, se devuelve nulo en vez de un número inventado.
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

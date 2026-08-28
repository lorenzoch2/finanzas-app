import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Loader2, Store, Tag, TicketPercent, TrendingUp, TriangleAlert } from 'lucide-react';
import {
  faltaMigracion,
  useAhorroDescuentos,
  useEvolucion,
  useGastoPorCategoria,
  useGastoPorEstablecimiento,
  useRankingProductos,
} from '@/datos/analisis';
import { useAvancePresupuestos } from '@/datos/presupuesto';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { mesAnterior } from '@/lib/fecha';
import { nombrarRango, ultimoDiaDelMes } from '@/lib/rango';
import BarrasHorizontales from '@/componentes/graficos/BarrasHorizontales';
import LineaMeses from '@/componentes/graficos/LineaMeses';
import Medidor from '@/componentes/graficos/Medidor';
import type { Barra } from '@/componentes/graficos/BarrasHorizontales';
import AvisoMigracion from '@/componentes/AvisoMigracion';

/**
 * Vista de análisis.
 *
 * Cada bloque responde una pregunta concreta, y ese es el criterio para que
 * exista: un gráfico que no contesta nada solo ocupa pantalla. Por eso varios
 * se ocultan o se cambian por una invitación cuando no hay con qué comparar.
 */

function Seccion({
  titulo,
  descripcion,
  icono,
  children,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  icono?: React.ReactNode;
  children: React.ReactNode;
  accion?: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-tinta">
            {icono}
            {titulo}
          </h2>
          {descripcion ? <p className="mt-1 text-sm text-tinta-3">{descripcion}</p> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

const retroceder = (mes: string, n: number): string => {
  let actual = mes;
  for (let i = 0; i < n; i += 1) actual = mesAnterior(actual);
  return actual;
};

export default function Analisis() {
  const { rango, zona } = useEstadoApp();
  const [nivel, setNivel] = useState<'categoria' | 'subcategoria'>('categoria');

  /**
   * Ventana de la evolución.
   *
   * Un mes suelto daría una línea de un punto, que no es una evolución. Si el
   * período elegido es corto se amplía hacia atrás hasta seis meses, para que
   * haya tendencia que mirar; si ya es largo, se respeta tal cual.
   */
  const ventana = useMemo(() => {
    const mesInicio = rango.desde.slice(0, 7);
    const mesFin = rango.hasta.slice(0, 7);

    if (mesInicio < mesFin) return { desde: rango.desde, hasta: rango.hasta };
    return { desde: `${retroceder(mesFin, 5)}-01`, hasta: ultimoDiaDelMes(mesFin) };
  }, [rango.desde, rango.hasta]);

  const categorias = useGastoPorCategoria(rango.desde, rango.hasta, zona);
  const evolucion = useEvolucion(ventana.desde, ventana.hasta, zona);
  const establecimientos = useGastoPorEstablecimiento(rango.desde, rango.hasta, zona);
  const ranking = useRankingProductos(rango.desde, rango.hasta, zona, 10);
  const ahorro = useAhorroDescuentos(rango.desde, rango.hasta, zona);
  const presupuestos = useAvancePresupuestos(rango.hasta, zona);

  /**
   * Por categoría principal o por subcategoría.
   *
   * Las diez principales caben de un vistazo y responden «¿en qué se me va la
   * plata?». Las 41 subcategorías responden «¿en qué exactamente?», que es
   * otra pregunta y no debería estorbar a la primera.
   */
  const barrasCategoria = useMemo<Barra[]>(() => {
    const datos = categorias.data ?? [];

    if (nivel === 'subcategoria') {
      return datos.map((d) => ({
        etiqueta: d.categoria,
        valor: Number(d.total),
        detalle: `${d.items} ${Number(d.items) === 1 ? 'ítem' : 'ítems'}`,
      }));
    }

    const porPadre = new Map<string, { total: number; items: number }>();
    for (const d of datos) {
      const acumulado = porPadre.get(d.categoria_padre) ?? { total: 0, items: 0 };
      acumulado.total += Number(d.total);
      acumulado.items += Number(d.items);
      porPadre.set(d.categoria_padre, acumulado);
    }

    return [...porPadre.entries()]
      .map(([etiqueta, { total, items }]) => ({
        etiqueta,
        valor: total,
        detalle: `${items} ${items === 1 ? 'ítem' : 'ítems'}`,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [categorias.data, nivel]);

  /**
   * Meses de la evolución, sin los vacíos del principio.
   *
   * Con datos desde junio, arrancar en septiembre del año anterior dibuja
   * nueve meses planos en cero que no dicen nada y aplastan la escala del
   * resto. Se recortan los ceros iniciales; los intermedios se conservan,
   * porque un mes sin gasto EN MEDIO de la serie sí es información.
   */
  const puntosEvolucion = useMemo(() => {
    const datos = (evolucion.data ?? []).map((p) => ({
      mes: p.mes,
      ingresos: Number(p.ingresos),
      gastos: Number(p.gastos),
      limite: Number(p.limite),
    }));

    const primero = datos.findIndex((p) => p.ingresos > 0 || p.gastos > 0);
    return primero <= 0 ? datos : datos.slice(primero);
  }, [evolucion.data]);

  const datosEstablecimiento = establecimientos.data ?? [];

  /**
   * Comparar establecimientos solo tiene sentido con más de uno. Una barra
   * sola al 100% no compara nada: ocupa una pantalla entera para decir «todo
   * tu gasto está aquí», que ya se sabía.
   */
  const hayQueComparar =
    datosEstablecimiento.length > 1 ||
    (datosEstablecimiento.length === 1 &&
      datosEstablecimiento[0]?.establecimiento !== 'Sin especificar');

  const barrasEstablecimiento = useMemo<Barra[]>(
    () =>
      datosEstablecimiento.map((d) => ({
        etiqueta: d.establecimiento,
        valor: Number(d.total),
        detalle: `${d.visitas} ${Number(d.visitas) === 1 ? 'compra' : 'compras'}`,
      })),
    [datosEstablecimiento],
  );

  const totalAhorrado = useMemo(
    () => (ahorro.data ?? []).reduce((s, a) => s + Number(a.ahorrado), 0),
    [ahorro.data],
  );

  const cargando = categorias.isPending || evolucion.isPending || establecimientos.isPending;
  const errorCarga = categorias.error ?? evolucion.error ?? establecimientos.error;

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-acento" size={28} aria-label="Cargando" />
      </div>
    );
  }

  if (errorCarga && faltaMigracion(errorCarga)) return <AvisoMigracion />;

  if (errorCarga) {
    return (
      <p className="mensaje-error flex items-start gap-2">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          {errorCarga instanceof Error ? errorCarga.message : 'No se pudo cargar el análisis.'}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {(presupuestos.data ?? []).length > 0 ? (
        <Seccion
          titulo={(presupuestos.data ?? []).length === 1 ? 'Tu límite' : 'Tus límites'}
          descripcion="Los traspasos entre tus cuentas no cuentan aquí, así que la referencia no se mueve."
        >
          <div className="space-y-6">
            {presupuestos.data?.map((p) => (
              <Medidor key={p.id} presupuesto={p} />
            ))}
          </div>
        </Seccion>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-tinta-2">
            Define un límite de gasto y verás aquí tu avance y la proyección de cierre.
          </p>
          <Link to="/preferencias" className="button-secondary">
            Definir límite
          </Link>
        </div>
      )}

      <Seccion
        titulo="En qué se te va la plata"
        descripcion={`${nombrarRango(rango)}, de mayor a menor.`}
        icono={<Tag size={18} className="text-tinta-3" aria-hidden />}
        accion={
          <div className="flex shrink-0 rounded-campo border border-borde bg-elevado p-1 text-xs">
            {(['categoria', 'subcategoria'] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNivel(n)}
                aria-pressed={nivel === n}
                className={`rounded-[0.5rem] px-3 py-1.5 font-medium transition ${
                  nivel === n ? 'bg-tarjeta text-acento shadow-suave' : 'text-tinta-3'
                }`}
              >
                {n === 'categoria' ? 'Categoría' : 'Detalle'}
              </button>
            ))}
          </div>
        }
      >
        <BarrasHorizontales datos={barrasCategoria} vacio="No hay gastos en este período." />

        {barrasCategoria.some((b) => b.etiqueta === 'Sin detalle') ? (
          <p className="mt-4 rounded-campo bg-elevado px-4 py-3 text-xs text-tinta-2">
            <strong>Sin detalle</strong> es lo que registraste sin desglosar ítem por ítem. Aparece
            para que el gráfico sume el total real; a medida que detalles tus boletas, esa barra se
            reparte entre las demás.
          </p>
        ) : null}
      </Seccion>

      {/* Con un solo mes no hay evolución que mostrar, solo un punto. */}
      {puntosEvolucion.length > 1 ? (
        <Seccion
          titulo="Cómo evoluciona"
          descripcion="La línea discontinua es tu límite."
          icono={<TrendingUp size={18} className="text-tinta-3" aria-hidden />}
        >
          <LineaMeses datos={puntosEvolucion} />
        </Seccion>
      ) : null}

      {hayQueComparar ? (
        <Seccion
          titulo="Dónde compras"
          descripcion="Cuánto se lleva cada establecimiento."
          icono={<Store size={18} className="text-tinta-3" aria-hidden />}
        >
          <BarrasHorizontales datos={barrasEstablecimiento} />
        </Seccion>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-lg text-sm text-tinta-2">
            Todavía no registras dónde compras. Al hacerlo verás qué local se lleva más y, con el
            catálogo de productos, dónde te sale más barato lo mismo.
          </p>
          <Link to="/preferencias" className="button-secondary shrink-0">
            <Store size={14} aria-hidden /> Añadir locales
          </Link>
        </div>
      )}

      {totalAhorrado > 0 ? (
        <Seccion
          titulo="Lo que te ahorraste"
          descripcion={`${formatearCLP(totalAhorrado)} en descuentos.`}
          icono={<TicketPercent size={18} className="text-tinta-3" aria-hidden />}
        >
          <BarrasHorizontales
            datos={(ahorro.data ?? []).map((a) => ({
              etiqueta: a.establecimiento,
              valor: Number(a.ahorrado),
              detalle: `${a.items} ${Number(a.items) === 1 ? 'ítem' : 'ítems'} con descuento`,
            }))}
          />
        </Seccion>
      ) : null}

      <Seccion titulo="Qué productos pesan más" descripcion="Los diez que más se llevan.">
        {(ranking.data ?? []).length === 0 ? (
          <p className="rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
            Detalla tus boletas ítem por ítem y aquí verás qué productos concretos pesan más.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde-suave text-left text-xs text-tinta-3">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 text-right font-medium">Veces</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-suave">
                {(ranking.data ?? []).map((p) => (
                  <tr key={`${p.producto}-${p.marca ?? ''}`}>
                    <td className="py-2 pr-3">
                      <span className="text-tinta">{p.producto}</span>
                      {p.marca ? <span className="text-tinta-3"> · {p.marca}</span> : null}
                      {p.calificacion ? (
                        <span className="ml-1 text-alerta">
                          {'★'.repeat(Math.round(Number(p.calificacion)))}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-tinta-3">{p.veces}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-tinta">
                      {formatearCLP(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

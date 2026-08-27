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
import { useAvancePresupuesto } from '@/datos/presupuesto';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { formatearMes } from '@/lib/fecha';
import BarrasHorizontales from '@/componentes/graficos/BarrasHorizontales';
import LineaMeses from '@/componentes/graficos/LineaMeses';
import Medidor from '@/componentes/graficos/Medidor';
import type { Barra } from '@/componentes/graficos/BarrasHorizontales';

/**
 * Vista de análisis.
 *
 * Cada bloque responde una pregunta concreta, y ese es el criterio para que
 * exista: un gráfico que no contesta nada solo ocupa pantalla.
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
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            {icono}
            {titulo}
          </h2>
          {descripcion ? <p className="mt-1 text-sm text-slate-500">{descripcion}</p> : null}
        </div>
        {accion}
      </div>
      {children}
    </section>
  );
}

export default function Analisis() {
  const { mes, zona } = useEstadoApp();
  const [nivel, setNivel] = useState<'categoria' | 'subcategoria'>('categoria');

  const categorias = useGastoPorCategoria(mes, zona);
  const evolucion = useEvolucion(12, zona);
  const establecimientos = useGastoPorEstablecimiento(mes, zona);
  const ranking = useRankingProductos(mes, zona, 10);
  const ahorro = useAhorroDescuentos(mes, zona);
  const presupuesto = useAvancePresupuesto(mes, zona);

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

  const barrasEstablecimiento = useMemo<Barra[]>(
    () =>
      (establecimientos.data ?? []).map((d) => ({
        etiqueta: d.establecimiento,
        valor: Number(d.total),
        detalle: `${d.visitas} ${Number(d.visitas) === 1 ? 'compra' : 'compras'}`,
      })),
    [establecimientos.data],
  );

  const totalAhorrado = useMemo(
    () => (ahorro.data ?? []).reduce((s, a) => s + Number(a.ahorrado), 0),
    [ahorro.data],
  );

  const cargando =
    categorias.isPending || evolucion.isPending || establecimientos.isPending;

  const errorCarga = categorias.error ?? evolucion.error ?? establecimientos.error;

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-brand-500" size={28} aria-label="Cargando" />
      </div>
    );
  }

  // Sin la migración 0016 las funciones no existen, y el error de PostgREST no
  // le dice a nadie qué hacer. Mejor decirlo en claro.
  if (errorCarga && faltaMigracion(errorCarga)) {
    return (
      <div className="card p-6 text-center">
        <TriangleAlert size={24} className="mx-auto mb-3 text-amber-500" aria-hidden />
        <h2 className="text-lg font-bold text-slate-900">Falta aplicar una migración</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Esta pantalla necesita las funciones de análisis, que se crean con la migración{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">0016_analisis</code>. Pégala
          en el editor SQL de Supabase y vuelve aquí.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Solo crea funciones de lectura: no toca ni una fila de tus datos.
        </p>
      </div>
    );
  }

  if (errorCarga) {
    return (
      <p className="mensaje-error flex items-start gap-2">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>{errorCarga instanceof Error ? errorCarga.message : 'No se pudo cargar el análisis.'}</span>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Presupuesto primero: es lo accionable. El resto explica. */}
      {presupuesto.data && presupuesto.data.limite > 0 ? (
        <Seccion
          titulo="Tu límite del mes"
          descripcion="Los traspasos entre tus cuentas no cuentan aquí, así que la referencia no se mueve."
        >
          <Medidor
            gastado={Number(presupuesto.data.gastado)}
            limite={Number(presupuesto.data.limite)}
            proyeccion={Number(presupuesto.data.proyeccion)}
            diasTranscurridos={Number(presupuesto.data.dias_transcurridos)}
            diasDelMes={Number(presupuesto.data.dias_del_mes)}
            esMesEnCurso={Boolean(presupuesto.data.es_mes_en_curso)}
          />
        </Seccion>
      ) : (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-600">
            Define un límite mensual y verás aquí tu avance y la proyección de cierre.
          </p>
          <Link to="/preferencias" className="button-secondary">
            Definir límite
          </Link>
        </div>
      )}

      <Seccion
        titulo="En qué se te va la plata"
        descripcion={`Gasto de ${formatearMes(mes)}, de mayor a menor.`}
        icono={<Tag size={18} className="text-slate-400" aria-hidden />}
        accion={
          <div className="flex shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-1 text-xs">
            {(['categoria', 'subcategoria'] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNivel(n)}
                aria-pressed={nivel === n}
                className={`rounded-xl px-3 py-1.5 font-medium transition ${
                  nivel === n ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                {n === 'categoria' ? 'Categoría' : 'Detalle'}
              </button>
            ))}
          </div>
        }
      >
        <BarrasHorizontales datos={barrasCategoria} vacio="No hay gastos este mes." />

        {/*
          «Sin detalle» no es una categoría: es el gasto registrado sin
          desglosar. Se muestra en vez de omitirse para que las barras sumen el
          total real del mes. Si se dejara fuera, el gráfico invitaría a sacar
          conclusiones sobre una parte del dinero creyendo que es el todo.
        */}
        {barrasCategoria.some((b) => b.etiqueta === 'Sin detalle') ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <strong>Sin detalle</strong> es lo que registraste sin desglosar ítem por ítem. Aparece
            para que el gráfico sume el total real del mes; a medida que detalles tus boletas, esa
            barra se reparte entre las demás.
          </p>
        ) : null}
      </Seccion>

      <Seccion
        titulo="Cómo evoluciona"
        descripcion="Últimos doce meses. La línea discontinua es tu límite."
        icono={<TrendingUp size={18} className="text-slate-400" aria-hidden />}
      >
        <LineaMeses
          datos={(evolucion.data ?? []).map((p) => ({
            mes: p.mes,
            ingresos: Number(p.ingresos),
            gastos: Number(p.gastos),
            limite: Number(p.limite),
          }))}
        />
      </Seccion>

      <Seccion
        titulo="Dónde compras"
        descripcion="Cuánto se lleva cada establecimiento este mes."
        icono={<Store size={18} className="text-slate-400" aria-hidden />}
      >
        <BarrasHorizontales
          datos={barrasEstablecimiento}
          vacio="Todavía no registras dónde compras. Al hacerlo podrás comparar precios entre locales."
        />
      </Seccion>

      {totalAhorrado > 0 ? (
        <Seccion
          titulo="Lo que te ahorraste"
          descripcion={`${formatearCLP(totalAhorrado)} en descuentos durante ${formatearMes(mes)}.`}
          icono={<TicketPercent size={18} className="text-slate-400" aria-hidden />}
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

      <Seccion
        titulo="Qué productos pesan más"
        descripcion="Los diez que más se llevan este mes."
      >
        {(ranking.data ?? []).length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            Detalla tus boletas ítem por ítem y aquí verás qué productos concretos pesan más.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Producto</th>
                  <th className="py-2 pr-3 text-right font-medium">Veces</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(ranking.data ?? []).map((p) => (
                  <tr key={`${p.producto}-${p.marca ?? ''}`}>
                    <td className="py-2 pr-3">
                      <span className="text-slate-800">{p.producto}</span>
                      {p.marca ? <span className="text-slate-400"> · {p.marca}</span> : null}
                      {p.calificacion ? (
                        <span className="ml-1 text-amber-500">
                          {'★'.repeat(Math.round(Number(p.calificacion)))}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{p.veces}</td>
                    <td className="py-2 text-right font-medium tabular-nums text-slate-900">
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

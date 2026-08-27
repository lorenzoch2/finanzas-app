import { useMemo, useState } from 'react';
import { formatearCLP } from '@/lib/dinero';

/**
 * Evolución de ingresos y gastos mes a mes.
 *
 * Dos series, así que aquí el color SÍ es categórico: el trabajo del dato es
 * distinguir identidades. Los tonos vienen de la paleta validada —aqua para
 * ingresos, rojo para gastos— y su par queda en la banda baja de separación
 * para daltonismo, lo que obliga a codificación secundaria: por eso ambas
 * series van siempre con leyenda y con etiqueta directa del último valor,
 * nunca distinguidas solo por color.
 *
 * Un solo eje. Ingresos y gastos comparten unidad (pesos) y escala, así que se
 * pueden leer juntos; un segundo eje permitiría dibujar cualquier relación
 * inventada entre ambos.
 *
 * SVG a mano en vez de una librería: son dos polilíneas, y una librería de
 * gráficos añadiría ~100 kB al bundle de una app que se abre con datos
 * móviles.
 */

export interface PuntoMes {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  gastos: number;
  limite: number;
}

const COLOR_INGRESOS = '#1baf7a';
const COLOR_GASTOS = '#e34948';

const ANCHO = 640;
const ALTO = 200;
const MARGEN = { arriba: 16, derecha: 12, abajo: 28, izquierda: 12 };

const nombreCorto = (mes: string): string => {
  const [, m] = mes.split('-').map(Number);
  const nombres = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return nombres[m ?? 0] ?? mes;
};

export default function LineaMeses({ datos }: { datos: PuntoMes[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  const geometria = useMemo(() => {
    if (datos.length === 0) return null;

    const maximo = Math.max(...datos.flatMap((d) => [d.ingresos, d.gastos, d.limite]), 1);
    const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

    const x = (i: number) =>
      MARGEN.izquierda + (datos.length === 1 ? anchoUtil / 2 : (i / (datos.length - 1)) * anchoUtil);
    const y = (v: number) => MARGEN.arriba + altoUtil - (v / maximo) * altoUtil;

    const linea = (clave: 'ingresos' | 'gastos') =>
      datos.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[clave])}`).join(' ');

    return { maximo, x, y, linea, altoUtil };
  }, [datos]);

  if (!geometria || datos.length === 0) {
    return (
      <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
        Todavía no hay meses que comparar.
      </p>
    );
  }

  const { x, y, linea } = geometria;
  const ultimo = datos[datos.length - 1];
  const punto = activo != null ? datos[activo] : null;

  return (
    <div>
      {/* Leyenda: con dos series nunca se distingue solo por color. */}
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLOR_INGRESOS }} aria-hidden />
          Ingresos
          {ultimo ? (
            <strong className="tabular-nums text-slate-900">{formatearCLP(ultimo.ingresos)}</strong>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLOR_GASTOS }} aria-hidden />
          Gastos
          {ultimo ? (
            <strong className="tabular-nums text-slate-900">{formatearCLP(ultimo.gastos)}</strong>
          ) : null}
        </span>
        {ultimo && ultimo.limite > 0 ? (
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="h-0 w-4 border-t border-dashed border-slate-400" aria-hidden />
            Límite
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="h-48 w-full min-w-[320px]"
          role="img"
          aria-label={`Evolución de ingresos y gastos en los últimos ${datos.length} meses`}
        >
          {/* Línea de límite: referencia, por eso discontinua y recesiva. */}
          {ultimo && ultimo.limite > 0 ? (
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(ultimo.limite)}
              y2={y(ultimo.limite)}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          <path d={linea('ingresos')} fill="none" stroke={COLOR_INGRESOS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={linea('gastos')} fill="none" stroke={COLOR_GASTOS} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {datos.map((d, i) => (
            <g key={d.mes}>
              {/* Anillo del color de la superficie para que los puntos no se
                  fundan cuando las dos series se cruzan. */}
              <circle cx={x(i)} cy={y(d.ingresos)} r={4} fill={COLOR_INGRESOS} stroke="#ffffff" strokeWidth={2} />
              <circle cx={x(i)} cy={y(d.gastos)} r={4} fill={COLOR_GASTOS} stroke="#ffffff" strokeWidth={2} />

              {/* Zona sensible ancha: en un teléfono el dedo no acierta un
                  punto de 8 px. */}
              <rect
                x={x(i) - 18}
                y={0}
                width={36}
                height={ALTO}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              />

              <text
                x={x(i)}
                y={ALTO - 8}
                textAnchor="middle"
                className="fill-slate-400"
                style={{ fontSize: 11 }}
              >
                {nombreCorto(d.mes)}
              </text>
            </g>
          ))}

          {activo != null ? (
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={MARGEN.arriba}
              y2={ALTO - MARGEN.abajo}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
          ) : null}
        </svg>
      </div>

      {punto ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-xs">
          <span className="font-medium text-slate-700">{punto.mes}</span>
          <span className="text-slate-600">
            Ingresos <strong className="tabular-nums">{formatearCLP(punto.ingresos)}</strong>
          </span>
          <span className="text-slate-600">
            Gastos <strong className="tabular-nums">{formatearCLP(punto.gastos)}</strong>
          </span>
          <span className={punto.ingresos - punto.gastos >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
            Margen{' '}
            <strong className="tabular-nums">{formatearCLP(punto.ingresos - punto.gastos)}</strong>
          </span>
        </div>
      ) : null}

      {/* Vista de tabla: obligatoria porque los tonos de las dos series quedan
          en la banda baja de separación para daltonismo. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1 pr-3 font-medium">Mes</th>
                <th className="py-1 pr-3 text-right font-medium">Ingresos</th>
                <th className="py-1 pr-3 text-right font-medium">Gastos</th>
                <th className="py-1 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.map((d) => (
                <tr key={d.mes}>
                  <td className="py-1 pr-3 text-slate-700">{d.mes}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-700">
                    {formatearCLP(d.ingresos)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-700">
                    {formatearCLP(d.gastos)}
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-700">
                    {formatearCLP(d.ingresos - d.gastos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

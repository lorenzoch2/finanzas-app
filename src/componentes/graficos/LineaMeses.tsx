import { useMemo, useState } from 'react';
import { formatearCLP } from '@/lib/dinero';

/**
 * Evolución de ingresos y gastos mes a mes.
 *
 * Dos series, así que aquí el color SÍ es categórico: el trabajo del dato es
 * distinguir identidades. Los tonos vienen de la paleta validada —aqua para
 * ingresos, rojo para gastos— y su par queda en la banda baja de separación
 * para daltonismo, lo que obliga a codificación secundaria: por eso ambas
 * llevan siempre leyenda, etiqueta directa y vista de tabla.
 *
 * Un solo eje. Ingresos y gastos comparten unidad y escala, así que se leen
 * juntos; un segundo eje permitiría dibujar cualquier relación inventada.
 *
 * LO IMPORTANTE: los meses sin datos NO se dibujan como cero.
 *
 * Antes, un mes sin registrar aparecía como una línea plana en el suelo,
 * indistinguible de un mes en que de verdad no se gastó nada. Eso es
 * presentar una ausencia como un hecho. Ahora la línea se corta y el hueco se
 * marca, que es lo honesto: la app no sabe qué pasó esos meses.
 */

export interface PuntoMes {
  mes: string; // 'YYYY-MM'
  ingresos: number;
  gastos: number;
  limite: number;
  sinDatos: boolean;
}

const COLOR_INGRESOS = '#1baf7a';
const COLOR_GASTOS = '#e34948';

const ANCHO = 640;
const ALTO = 210;
const MARGEN = { arriba: 16, derecha: 12, abajo: 34, izquierda: 12 };

const NOMBRES = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const nombreCorto = (mes: string): string => {
  const [, m] = mes.split('-').map(Number);
  return NOMBRES[m ?? 0] ?? mes;
};

export default function LineaMeses({ datos }: { datos: PuntoMes[] }) {
  const [activo, setActivo] = useState<number | null>(null);

  const geometria = useMemo(() => {
    if (datos.length === 0) return null;

    const conDatos = datos.filter((d) => !d.sinDatos);
    const maximo = Math.max(
      ...conDatos.flatMap((d) => [d.ingresos, d.gastos]),
      ...datos.map((d) => d.limite),
      1,
    );

    const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha;
    const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo;

    const x = (i: number) =>
      MARGEN.izquierda + (datos.length === 1 ? anchoUtil / 2 : (i / (datos.length - 1)) * anchoUtil);
    const y = (v: number) => MARGEN.arriba + altoUtil - (v / maximo) * altoUtil;

    /**
     * Tramos continuos, separados por los huecos.
     *
     * Una sola polilínea uniría los meses a ambos lados de un vacío con una
     * recta, dando a entender una transición que nadie observó.
     */
    const tramos = (clave: 'ingresos' | 'gastos'): string[] => {
      const salida: string[] = [];
      let actual: string[] = [];

      datos.forEach((d, i) => {
        if (d.sinDatos) {
          if (actual.length) salida.push(actual.join(' '));
          actual = [];
          return;
        }
        actual.push(`${actual.length === 0 ? 'M' : 'L'} ${x(i)} ${y(d[clave])}`);
      });

      if (actual.length) salida.push(actual.join(' '));
      // Un tramo de un solo punto no dibuja nada: se descarta y el punto ya
      // se pinta aparte.
      return salida.filter((t) => t.includes('L'));
    };

    return { maximo, x, y, tramos, altoUtil };
  }, [datos]);

  if (!geometria || datos.length === 0) {
    return (
      <p className="rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
        Todavía no hay meses que comparar.
      </p>
    );
  }

  const { x, y, tramos } = geometria;
  const ultimo = [...datos].reverse().find((d) => !d.sinDatos);
  const punto = activo != null ? datos[activo] : null;
  const huecos = datos.filter((d) => d.sinDatos).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-tinta-2">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLOR_INGRESOS }} aria-hidden />
          Ingresos
          {ultimo ? (
            <strong className="tabular-nums text-tinta">{formatearCLP(ultimo.ingresos)}</strong>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-tinta-2">
          <span className="h-0.5 w-4 rounded" style={{ backgroundColor: COLOR_GASTOS }} aria-hidden />
          Gastos
          {ultimo ? (
            <strong className="tabular-nums text-tinta">{formatearCLP(ultimo.gastos)}</strong>
          ) : null}
        </span>
        {ultimo && ultimo.limite > 0 ? (
          <span className="flex items-center gap-1.5 text-tinta-3">
            <span className="h-0 w-4 border-t border-dashed border-tinta-3" aria-hidden />
            Límite
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          className="h-52 w-full min-w-[320px]"
          role="img"
          aria-label={`Evolución de ingresos y gastos en ${datos.length} meses${huecos ? `, con ${huecos} sin datos` : ''}`}
        >
          {ultimo && ultimo.limite > 0 ? (
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(ultimo.limite)}
              y2={y(ultimo.limite)}
              stroke="currentColor"
              className="text-tinta-3"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {/* Los meses sin datos se sombrean: el hueco es visible, no
              silencioso. */}
          {datos.map((d, i) =>
            d.sinDatos ? (
              <rect
                key={`hueco-${d.mes}`}
                x={x(i) - (ANCHO - MARGEN.izquierda - MARGEN.derecha) / Math.max(datos.length - 1, 1) / 2}
                y={MARGEN.arriba}
                width={(ANCHO - MARGEN.izquierda - MARGEN.derecha) / Math.max(datos.length - 1, 1)}
                height={ALTO - MARGEN.arriba - MARGEN.abajo}
                fill="currentColor"
                className="text-tinta-3"
                opacity={0.06}
              />
            ) : null,
          )}

          {tramos('ingresos').map((d, i) => (
            <path
              key={`ing-${i}`}
              d={d}
              fill="none"
              stroke={COLOR_INGRESOS}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {tramos('gastos').map((d, i) => (
            <path
              key={`gas-${i}`}
              d={d}
              fill="none"
              stroke={COLOR_GASTOS}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {datos.map((d, i) => (
            <g key={d.mes}>
              {!d.sinDatos ? (
                <>
                  {/* Anillo del color de la superficie para que los puntos no
                      se fundan cuando las series se cruzan. */}
                  <circle
                    cx={x(i)}
                    cy={y(d.ingresos)}
                    r={4}
                    fill={COLOR_INGRESOS}
                    stroke="var(--color-tarjeta)"
                    strokeWidth={2}
                  />
                  <circle
                    cx={x(i)}
                    cy={y(d.gastos)}
                    r={4}
                    fill={COLOR_GASTOS}
                    stroke="var(--color-tarjeta)"
                    strokeWidth={2}
                  />
                </>
              ) : null}

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
                y={ALTO - 18}
                textAnchor="middle"
                fill="currentColor"
                className="text-tinta-3"
                style={{ fontSize: 11 }}
              >
                {nombreCorto(d.mes)}
              </text>

              {d.sinDatos ? (
                <text
                  x={x(i)}
                  y={ALTO - 5}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-tinta-3"
                  style={{ fontSize: 9 }}
                >
                  sin datos
                </text>
              ) : null}
            </g>
          ))}

          {activo != null ? (
            <line
              x1={x(activo)}
              x2={x(activo)}
              y1={MARGEN.arriba}
              y2={ALTO - MARGEN.abajo}
              stroke="currentColor"
              className="text-tinta-3"
              strokeWidth={1}
              opacity={0.5}
            />
          ) : null}
        </svg>
      </div>

      {punto ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-campo bg-elevado px-3 py-2 text-xs">
          <span className="font-medium text-tinta-2">{punto.mes}</span>
          {punto.sinDatos ? (
            <span className="text-tinta-3">Sin datos registrados en este mes.</span>
          ) : (
            <>
              <span className="text-tinta-2">
                Ingresos <strong className="tabular-nums">{formatearCLP(punto.ingresos)}</strong>
              </span>
              <span className="text-tinta-2">
                Gastos <strong className="tabular-nums">{formatearCLP(punto.gastos)}</strong>
              </span>
              <span className={punto.ingresos - punto.gastos >= 0 ? 'text-entra' : 'text-sale'}>
                Margen{' '}
                <strong className="tabular-nums">{formatearCLP(punto.ingresos - punto.gastos)}</strong>
              </span>
            </>
          )}
        </div>
      ) : null}

      {huecos > 0 ? (
        <p className="mt-2 text-xs text-tinta-3">
          {huecos} {huecos === 1 ? 'mes sombreado no tiene' : 'meses sombreados no tienen'} datos
          registrados. La línea se corta ahí en vez de dibujar un cero que no se midió.
        </p>
      ) : null}

      {/* Vista de tabla: obligatoria porque los tonos de las dos series quedan
          en la banda baja de separación para daltonismo. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-tinta-3">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-tinta-3">
                <th className="py-1 pr-3 font-medium">Mes</th>
                <th className="py-1 pr-3 text-right font-medium">Ingresos</th>
                <th className="py-1 pr-3 text-right font-medium">Gastos</th>
                <th className="py-1 text-right font-medium">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde-suave">
              {datos.map((d) => (
                <tr key={d.mes}>
                  <td className="py-1 pr-3 text-tinta-2">{d.mes}</td>
                  {d.sinDatos ? (
                    <td className="py-1 text-tinta-3 italic" colSpan={3}>
                      sin datos
                    </td>
                  ) : (
                    <>
                      <td className="py-1 pr-3 text-right tabular-nums text-tinta-2">
                        {formatearCLP(d.ingresos)}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-tinta-2">
                        {formatearCLP(d.gastos)}
                      </td>
                      <td className="py-1 text-right tabular-nums text-tinta-2">
                        {formatearCLP(d.ingresos - d.gastos)}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

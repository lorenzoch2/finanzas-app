import { formatearCLP } from '@/lib/dinero';

/**
 * Avance contra el límite mensual.
 *
 * Es un medidor y no un gráfico circular porque el dato es UN ratio contra un
 * tope: una tarta de dos porciones diría lo mismo ocupando más espacio y
 * leyéndose peor.
 *
 * La pista usa el mismo tono en dos intensidades —no dos colores distintos—
 * porque gastado y disponible son partes de la misma magnitud, no categorías
 * que compitan.
 *
 * La marca de proyección es lo que hace útil el medidor a mitad de mes: saber
 * que llevas el 40% del límite no dice nada si no sabes que vas por el día 8.
 */

interface Props {
  gastado: number;
  limite: number;
  proyeccion: number;
  diasTranscurridos: number;
  diasDelMes: number;
  esMesEnCurso: boolean;
}

export default function Medidor({
  gastado,
  limite,
  proyeccion,
  diasTranscurridos,
  diasDelMes,
  esMesEnCurso,
}: Props) {
  if (limite <= 0) return null;

  const proporcion = Math.min(gastado / limite, 1);
  const excedido = gastado > limite;
  const proyeccionExcede = proyeccion > limite;

  // La proyección se dibuja hasta el borde aunque se pase, para no deformar
  // la escala del medidor.
  const posicionProyeccion = Math.min(proyeccion / limite, 1);
  const posicionRitmo = diasDelMes > 0 ? diasTranscurridos / diasDelMes : 0;

  const restante = limite - gastado;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm text-tinta-2">
          {formatearCLP(gastado)} de {formatearCLP(limite)}
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            excedido ? 'text-sale' : 'text-tinta-2'
          }`}
        >
          {Math.round((gastado / limite) * 100)}%
        </span>
      </div>

      <div
        className="relative h-4 w-full overflow-hidden rounded-full bg-elevado"
        role="meter"
        aria-valuenow={Math.round(gastado)}
        aria-valuemin={0}
        aria-valuemax={Math.round(limite)}
        aria-label={`Gastado ${formatearCLP(gastado)} de un límite de ${formatearCLP(limite)}`}
      >
        <div
          className={`h-full rounded-full transition-all ${
            excedido ? 'bg-sale' : 'bg-acento'
          }`}
          style={{ width: `${proporcion * 100}%` }}
        />

        {/*
          Dónde deberías ir si gastaras parejo todo el mes. Sin esta referencia,
          un 60% no dice si vas bien o mal: depende de si es día 10 o día 25.
        */}
        {esMesEnCurso && posicionRitmo > 0 && posicionRitmo < 1 ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-tinta-3"
            style={{ left: `${posicionRitmo * 100}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        {esMesEnCurso ? (
          <span className="flex items-center gap-1.5 text-tinta-3">
            <span className="inline-block h-3 w-0.5 bg-tinta-3" aria-hidden />
            Día {diasTranscurridos} de {diasDelMes}
          </span>
        ) : (
          <span className="text-tinta-3">Mes cerrado</span>
        )}

        <span className={excedido ? 'font-medium text-sale' : 'text-tinta-3'}>
          {excedido
            ? `${formatearCLP(Math.abs(restante))} por encima`
            : `Quedan ${formatearCLP(restante)}`}
        </span>
      </div>

      {esMesEnCurso && proyeccion > 0 ? (
        <p
          className={`mt-3 rounded-campo px-3 py-2 text-xs ${
            proyeccionExcede
              ? 'bg-sale-suave text-sale'
              : 'bg-entra-suave text-entra'
          }`}
        >
          {proyeccionExcede ? (
            <>
              A este ritmo cerrarías el mes en <strong>{formatearCLP(proyeccion)}</strong>,{' '}
              {formatearCLP(proyeccion - limite)} sobre tu límite.
            </>
          ) : (
            <>
              A este ritmo cerrarías en <strong>{formatearCLP(proyeccion)}</strong>, dentro del
              límite.
            </>
          )}
        </p>
      ) : null}

      {/* La proyección también en la barra, para verla sin leer. */}
      {esMesEnCurso && proyeccion > gastado ? (
        <div className="sr-only">
          Proyección de cierre: {formatearCLP(proyeccion)} ({Math.round(posicionProyeccion * 100)}%
          del límite).
        </div>
      ) : null}
    </div>
  );
}

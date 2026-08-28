import { formatearCLP } from '@/lib/dinero';
import { diaLegible } from '@/lib/rango';
import type { AvancePresupuesto } from '@/lib/database.types';

/**
 * Avance contra un límite de gasto.
 *
 * Es un medidor y no un gráfico circular porque el dato es UN ratio contra un
 * tope: una tarta de dos porciones diría lo mismo ocupando más y leyéndose
 * peor.
 *
 * La pista usa el mismo tono en dos intensidades —no dos colores— porque
 * gastado y disponible son partes de la misma magnitud, no categorías que
 * compitan.
 *
 * La marca de ritmo es lo que lo hace útil a media carrera: saber que llevas
 * el 40% no dice nada si no sabes por qué día del período vas.
 */

export default function Medidor({ presupuesto }: { presupuesto: AvancePresupuesto }) {
  const limite = Number(presupuesto.monto);
  const gastado = Number(presupuesto.gastado);
  const proyeccion = Number(presupuesto.proyeccion);
  const dias = Number(presupuesto.dias_transcurridos);
  const diasTotales = Number(presupuesto.dias_totales);
  const activo = Boolean(presupuesto.esta_activo);

  if (limite <= 0) return null;

  const proporcion = Math.min(gastado / limite, 1);
  const excedido = gastado > limite;
  const proyeccionExcede = proyeccion > limite;
  const posicionRitmo = diasTotales > 0 ? dias / diasTotales : 0;
  const restante = limite - gastado;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate font-semibold text-tinta">{presupuesto.nombre}</p>
          <p className="text-xs text-tinta-3">
            {diaLegible(presupuesto.fecha_inicio)} – {diaLegible(presupuesto.fecha_fin, true)}
            {presupuesto.categoria ? ` · ${presupuesto.categoria}` : ''}
            {presupuesto.fuentes !== 'Todas las cuentas' ? ` · ${presupuesto.fuentes}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            excedido ? 'text-sale' : 'text-tinta-2'
          }`}
        >
          {Math.round((gastado / limite) * 100)}%
        </span>
      </div>

      <p className="mb-2 text-sm text-tinta-2">
        <strong className="tabular-nums text-tinta">{formatearCLP(gastado)}</strong> de{' '}
        <span className="tabular-nums">{formatearCLP(limite)}</span>
      </p>

      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-elevado"
        role="meter"
        aria-valuenow={Math.round(gastado)}
        aria-valuemin={0}
        aria-valuemax={Math.round(limite)}
        aria-label={`${presupuesto.nombre}: gastado ${formatearCLP(gastado)} de ${formatearCLP(limite)}`}
      >
        <div
          className={`h-full rounded-full transition-all ${excedido ? 'bg-sale' : 'bg-acento'}`}
          style={{ width: `${Math.max(proporcion * 100, 1.5)}%` }}
        />

        {/*
          Dónde deberías ir si gastaras parejo. Sin esta referencia, un 60% no
          dice si vas bien o mal: depende de si vas por el día 10 o el 25.
        */}
        {activo && posicionRitmo > 0 && posicionRitmo < 1 ? (
          <div
            className="absolute inset-y-0 w-0.5 bg-tinta-3"
            style={{ left: `${posicionRitmo * 100}%` }}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        {activo ? (
          <span className="flex items-center gap-1.5 text-tinta-3">
            <span className="inline-block h-3 w-0.5 bg-tinta-3" aria-hidden />
            Día {dias} de {diasTotales}
          </span>
        ) : (
          <span className="text-tinta-3">Período cerrado</span>
        )}

        <span className={excedido ? 'font-medium text-sale' : 'text-tinta-3'}>
          {excedido
            ? `${formatearCLP(Math.abs(restante))} por encima`
            : `Quedan ${formatearCLP(restante)}`}
        </span>
      </div>

      {activo && proyeccion > 0 ? (
        <p
          className={`mt-3 rounded-campo px-3 py-2 text-xs ${
            proyeccionExcede ? 'bg-sale-suave text-sale' : 'bg-entra-suave text-entra'
          }`}
        >
          {proyeccionExcede ? (
            <>
              A este ritmo cerrarías en <strong>{formatearCLP(proyeccion)}</strong>,{' '}
              {formatearCLP(proyeccion - limite)} sobre el límite.
            </>
          ) : (
            <>
              A este ritmo cerrarías en <strong>{formatearCLP(proyeccion)}</strong>, dentro del
              límite.
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

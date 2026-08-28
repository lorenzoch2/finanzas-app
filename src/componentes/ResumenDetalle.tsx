import { useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import type { ValoresTransaccion } from './esquemaTransaccion';
import { sumarDetalle } from './esquemaTransaccion';

/**
 * Cuadre entre la suma del detalle y el total ingresado.
 *
 * Está separado del formulario por la misma razón que `FilaItem`: necesita
 * reaccionar a cada tecla, y aislarlo evita que el formulario completo se
 * redibuje con él.
 */

interface Props {
  control: Control<ValoresTransaccion>;
  onUsarTotalDetalle: (total: number) => void;
}

export default function ResumenDetalle({ control, onUsarTotalDetalle }: Props) {
  const items = useWatch({ control, name: 'items' });
  const montoTexto = useWatch({ control, name: 'monto' });

  const totalDetalle = sumarDetalle(items ?? []);
  const totalIngresado = parsearMonto(montoTexto) ?? 0;

  const sobrante = Math.max(totalIngresado - totalDetalle, 0);
  const excedido = totalDetalle - totalIngresado > 0.5;

  return (
    <div className="rounded-tarjeta bg-elevado p-4 text-sm">
      <div className="flex justify-between">
        <span className="text-tinta-2">Suma del detalle</span>
        <strong className="tabular-nums text-tinta">{formatearCLP(totalDetalle)}</strong>
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-tinta-2">Total ingresado</span>
        <strong className="tabular-nums text-tinta">{formatearCLP(totalIngresado)}</strong>
      </div>

      {excedido ? (
        <p className="mt-3 text-sale">
          El detalle supera el total en {formatearCLP(totalDetalle - totalIngresado)}.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => onUsarTotalDetalle(Math.round(totalDetalle))}
          >
            Usar la suma del detalle
          </button>
        </p>
      ) : sobrante > 0.5 ? (
        <p className="mt-3 text-tinta-2">
          Quedan {formatearCLP(sobrante)} sin detallar. Se guardarán en la transacción como gasto sin
          detalle, no como un producto inventado.
        </p>
      ) : null}
    </div>
  );
}

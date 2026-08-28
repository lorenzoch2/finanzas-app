import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearMes, mesActual, mesAnterior, mesSiguiente } from '@/lib/fecha';

/**
 * Selector del mes que se está mirando.
 *
 * Con flechas en vez de un `<input type="month">` porque en el teléfono
 * moverse un mes atrás es lo que se hace el 95% de las veces, y abrir un
 * selector de calendario para eso es un paso de más.
 */
export default function SelectorMes() {
  const { mes, setMes, zona } = useEstadoApp();
  const hoy = mesActual(zona);
  const esFuturo = mes >= hoy;

  return (
    <div className="flex items-center gap-0.5 rounded-campo border border-borde bg-tarjeta px-1 py-1">
      <button
        type="button"
        className="button-ghost px-2 py-1.5"
        onClick={() => setMes(mesAnterior(mes))}
        aria-label="Mes anterior"
      >
        <ChevronLeft size={16} aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => setMes(hoy)}
        className="min-w-[6.5rem] px-1 text-center text-xs font-semibold text-tinta-2"
        title="Volver al mes actual"
      >
        {formatearMes(mes)}
      </button>

      <button
        type="button"
        className="button-ghost px-2 py-1.5"
        onClick={() => setMes(mesSiguiente(mes))}
        disabled={esFuturo}
        aria-label="Mes siguiente"
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </div>
  );
}

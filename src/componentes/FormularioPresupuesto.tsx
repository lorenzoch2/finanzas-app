import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useFuentes } from '@/datos/saldos';
import { useGuardarPresupuesto } from '@/datos/presupuesto';
import type { PresupuestoConFuentes } from '@/datos/presupuesto';
import SelectorCategoria from './SelectorCategoria';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { ultimoDiaDelMes } from '@/lib/rango';
import { mesActual } from '@/lib/fecha';

/**
 * Crear o editar un límite de gasto.
 *
 * El período es libre: un mes sigue siendo el caso normal y viene por defecto,
 * pero «del 1 al 15 de diciembre para los regalos» es igual de válido.
 *
 * Las cuentas son opcionales. Sin marcar ninguna, el límite aplica a todas,
 * que es lo habitual: obligar a marcar las tres para el caso normal sería
 * trabajo por nada.
 */

interface Props {
  zona: string;
  edicion?: PresupuestoConFuentes | null;
  onGuardado?: () => void;
  onCancelar?: () => void;
}

export default function FormularioPresupuesto({ zona, edicion, onGuardado, onCancelar }: Props) {
  const { data: fuentes = [] } = useFuentes();
  const guardar = useGuardarPresupuesto();

  const mes = mesActual(zona);
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [desde, setDesde] = useState(`${mes}-01`);
  const [hasta, setHasta] = useState(ultimoDiaDelMes(mes));
  const [categoriaId, setCategoriaId] = useState('');
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!edicion) return;
    setNombre(edicion.nombre);
    setMonto(String(edicion.monto));
    setDesde(edicion.fecha_inicio);
    setHasta(edicion.fecha_fin);
    setCategoriaId(edicion.categoria_id ?? '');
    setSeleccionadas(edicion.presupuesto_fuentes.map((f) => f.fuente_id));
  }, [edicion]);

  const alternarFuente = (id: string) =>
    setSeleccionadas((previas) =>
      previas.includes(id) ? previas.filter((f) => f !== id) : [...previas, id],
    );

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    const importe = parsearMonto(monto);
    if (importe == null) {
      setError('Escribe el límite.');
      return;
    }

    try {
      await guardar.mutateAsync({
        ...(edicion ? { id: edicion.id } : {}),
        nombre,
        monto: importe,
        fechaInicio: desde,
        fechaFin: hasta,
        categoriaId: categoriaId || null,
        fuentes: seleccionadas,
      });

      if (!edicion) {
        setNombre('');
        setMonto('');
        setCategoriaId('');
        setSeleccionadas([]);
      }
      onGuardado?.();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    }
  };

  const importe = parsearMonto(monto) ?? 0;

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label" htmlFor="pre-nombre">
            Nombre
          </label>
          <input
            id="pre-nombre"
            className="input"
            placeholder="Gastos de diciembre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="pre-monto">
            Límite
          </label>
          <input
            id="pre-monto"
            className="input"
            inputMode="decimal"
            placeholder="800.000"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
          {importe > 0 ? <p className="text-xs text-tinta-3">{formatearCLP(importe)}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="pre-desde">
            Desde
          </label>
          <input
            id="pre-desde"
            type="date"
            className="input"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="pre-hasta">
            Hasta
          </label>
          <input
            id="pre-hasta"
            type="date"
            className="input"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <p className="label mb-1.5">Solo para una categoría (opcional)</p>
        <SelectorCategoria valor={categoriaId} onCambiar={setCategoriaId} />
      </div>

      <fieldset>
        <legend className="label mb-1.5">Cuentas</legend>
        <p className="mb-2 text-xs text-tinta-3">
          Sin marcar ninguna, el límite cuenta el gasto de todas.
        </p>
        <div className="flex flex-wrap gap-2">
          {fuentes.map((fuente) => {
            const marcada = seleccionadas.includes(fuente.id);
            return (
              <button
                key={fuente.id}
                type="button"
                onClick={() => alternarFuente(fuente.id)}
                aria-pressed={marcada}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  marcada
                    ? 'border-acento-borde bg-acento-suave text-acento'
                    : 'border-borde bg-tarjeta text-tinta-3 hover:text-tinta-2'
                }`}
              >
                {fuente.nombre}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error ? <p className="mensaje-error">{error}</p> : null}

      <div className="flex gap-2">
        <button type="submit" className="button-primary flex-1" disabled={guardar.isPending}>
          {guardar.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
          {edicion ? 'Guardar cambios' : 'Crear límite'}
        </button>
        {onCancelar ? (
          <button type="button" className="button-secondary" onClick={onCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

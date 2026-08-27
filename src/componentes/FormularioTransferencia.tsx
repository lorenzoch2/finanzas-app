import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Loader2, Repeat } from 'lucide-react';
import { useFuentes } from '@/datos/saldos';
import { useTransferir } from '@/datos/transacciones';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { entradaDateTimeAIso, paraInputDateTime } from '@/lib/fecha';

/**
 * Traspaso entre cuentas propias.
 *
 * Antes había que anotarlo como un gasto en una cuenta y un ingreso en otra,
 * con dos consecuencias malas: los totales del mes se inflaban por ambos lados
 * con dinero que nunca entró ni salió, y nada garantizaba que las dos mitades
 * cuadraran.
 *
 * Ahora es una sola operación. No cuenta como ingreso ni como gasto, así que
 * mover plata entre tus cuentas no altera el avance del presupuesto: esa es la
 * razón de que el límite mensual siga siendo una referencia estable.
 */
export default function FormularioTransferencia({ onHecha }: { onHecha?: () => void }) {
  const { zona } = useEstadoApp();
  const { data: fuentes = [] } = useFuentes();
  const transferir = useTransferir();

  const principal = useMemo(() => fuentes.find((f) => f.es_principal), [fuentes]);

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(() => paraInputDateTime(new Date(), zona));
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const origenReal = origen || principal?.id || '';
  const importe = parsearMonto(monto) ?? 0;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const fechaIso = entradaDateTimeAIso(fecha, zona);
    if (!fechaIso) {
      setError('La fecha no es válida.');
      return;
    }

    try {
      await transferir.mutateAsync({
        origenId: origenReal,
        destinoId: destino,
        monto: importe,
        fecha: fechaIso,
        nota,
      });

      setMonto('');
      setNota('');
      setAviso('Traspaso registrado.');
      onHecha?.();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo transferir.');
    }
  };

  // Un traspaso necesita al menos dos cuentas entre las que mover el dinero.
  if (fuentes.length < 2) {
    return (
      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Traspaso entre cuentas</h2>
        <p className="mt-2 text-sm text-slate-600">
          Necesitas al menos dos cuentas para poder mover dinero entre ellas.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="card space-y-4 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Repeat size={18} className="text-slate-400" aria-hidden />
        <h2 className="text-lg font-bold text-slate-900">Traspaso entre cuentas</h2>
      </div>

      <p className="text-sm text-slate-600">
        Mover plata entre tus cuentas no es un gasto ni un ingreso, así que no altera los totales del
        mes ni el avance de tu límite.
      </p>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="space-y-1.5">
          <label className="label" htmlFor="tr-origen">
            Desde
          </label>
          <select
            id="tr-origen"
            className="input"
            value={origenReal}
            onChange={(e) => setOrigen(e.target.value)}
            required
          >
            <option value="">Elige la cuenta</option>
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
                {f.es_principal ? ' (principal)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden pb-3 sm:block">
          <ArrowRight size={18} className="text-slate-300" aria-hidden />
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="tr-destino">
            Hacia
          </label>
          <select
            id="tr-destino"
            className="input"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            required
          >
            <option value="">Elige la cuenta</option>
            {/* La cuenta de origen no aparece: no se puede transferir a sí misma. */}
            {fuentes
              .filter((f) => f.id !== origenReal)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label" htmlFor="tr-monto">
            Monto
          </label>
          <input
            id="tr-monto"
            className="input"
            inputMode="decimal"
            placeholder="50.000"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
          {importe > 0 ? <p className="text-xs text-slate-500">{formatearCLP(importe)}</p> : null}
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="tr-fecha">
            Fecha
          </label>
          <input
            id="tr-fecha"
            type="datetime-local"
            className="input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="label" htmlFor="tr-nota">
            Nota
          </label>
          <input
            id="tr-nota"
            className="input"
            placeholder="Opcional"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="mensaje-error">{error}</p> : null}
      {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

      <button type="submit" className="button-primary w-full" disabled={transferir.isPending}>
        {transferir.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        Transferir
      </button>
    </form>
  );
}

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { MOTIVOS, useCrearAjuste } from '@/datos/ajustes';
import { useFuentes, useSaldos } from '@/datos/saldos';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { paraInputDate } from '@/lib/fecha';
import type { MotivoAjuste } from '@/lib/database.types';

/**
 * Declarar el saldo real de una cuenta.
 *
 * La diferencia con la versión anterior: antes esto solo fijaba un número y
 * el hueco entre lo declarado y lo que decía el libro se tragaba en silencio.
 * Pero ese hueco es exactamente el dinero que se quedó sin registrar, y con
 * $779.930 llegados por ajuste —el 40% de todo lo que ha entrado— era la
 * razón de que el margen saliera negativo mes tras mes.
 *
 * Ahora el hueco se muestra ANTES de guardar y se pregunta qué fue. Con eso,
 * la tasa de ahorro deja de mentir.
 */
export default function FormularioAjuste() {
  const { zona } = useEstadoApp();
  const { data: fuentes = [] } = useFuentes();
  const crear = useCrearAjuste();

  const [fuenteId, setFuenteId] = useState('');
  const [fecha, setFecha] = useState(() => paraInputDate(new Date(), zona));
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState<MotivoAjuste>('apertura');
  const [nota, setNota] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Lo que el libro dice de esa cuenta en esa fecha. Se consulta en vivo para
  // poder enseñar el hueco antes de guardar, no después.
  const saldos = useSaldos(fecha, zona);

  const segunLibro = useMemo(() => {
    if (!fuenteId) return null;
    const fila = (saldos.data ?? []).find((f) => f.fuente_id === fuenteId);
    return fila ? Number(fila.saldo_actual) : null;
  }, [saldos.data, fuenteId]);

  const declarado = parsearMonto(monto);
  const brecha = segunLibro != null && declarado != null ? declarado - segunLibro : null;
  const hayBrecha = brecha != null && Math.abs(brecha) >= 1;

  /**
   * El motivo se propone según el signo del hueco, porque es lo que casi
   * siempre significa: si sobra plata es que entró sin anotarse, y si falta
   * es que salió. Solo una propuesta; se puede cambiar.
   */
  const motivoSugerido: MotivoAjuste =
    !hayBrecha ? 'correccion' : brecha! > 0 ? 'ingreso_no_registrado' : 'gasto_no_registrado';

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    if (declarado == null) {
      setError('Indica el saldo que tiene la cuenta.');
      return;
    }

    try {
      await crear.mutateAsync({
        fuente_id: fuenteId,
        fecha_referencia: fecha,
        monto_ajustado: declarado,
        motivo,
        nota: nota || null,
      });
      setMonto('');
      setNota('');
      setAviso('Saldo declarado.');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el ajuste.');
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label" htmlFor="aj-fuente">
            Cuenta
          </label>
          <select
            id="aj-fuente"
            className="input"
            value={fuenteId}
            onChange={(e) => setFuenteId(e.target.value)}
            required
          >
            <option value="">Elige la cuenta</option>
            {fuentes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="aj-fecha">
            A fecha de
          </label>
          <input
            id="aj-fecha"
            type="date"
            className="input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="label" htmlFor="aj-monto">
            Saldo real de la cuenta ese día
          </label>
          <input
            id="aj-monto"
            className="input"
            inputMode="decimal"
            placeholder="550.000"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
          />
        </div>
      </div>

      {/* La brecha, antes de guardar */}
      {fuenteId && declarado != null ? (
        <div className="rounded-campo border border-borde bg-elevado p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-tinta-3">Según el libro</span>
            <strong className="tabular-nums text-tinta-2">
              {segunLibro != null ? formatearCLP(segunLibro) : '—'}
            </strong>
            <ArrowRight size={14} className="text-tinta-3" aria-hidden />
            <span className="text-tinta-3">tú dices</span>
            <strong className="tabular-nums text-tinta">{formatearCLP(declarado)}</strong>
          </div>

          {hayBrecha ? (
            <p
              className={`mt-2 text-sm font-medium ${brecha! > 0 ? 'text-entra' : 'text-sale'}`}
            >
              {brecha! > 0
                ? `Sobran ${formatearCLP(brecha!)} que el libro no explica.`
                : `Faltan ${formatearCLP(Math.abs(brecha!))} que el libro no explica.`}
            </p>
          ) : (
            <p className="mt-2 text-sm text-tinta-3">
              El libro ya cuadra con lo que declaras. No hay nada sin explicar.
            </p>
          )}
        </div>
      ) : null}

      <fieldset>
        <legend className="label mb-2">
          {hayBrecha ? '¿De dónde salió esa diferencia?' : '¿Por qué declaras el saldo?'}
        </legend>

        <div className="space-y-1.5">
          {MOTIVOS.map((m) => (
            <label
              key={m.valor}
              className={`flex cursor-pointer items-start gap-2.5 rounded-campo border p-3 transition ${
                motivo === m.valor
                  ? 'border-acento-borde bg-acento-suave'
                  : 'border-borde hover:bg-elevado'
              }`}
            >
              <input
                type="radio"
                name="motivo"
                className="mt-0.5 size-4 accent-acento"
                checked={motivo === m.valor}
                onChange={() => setMotivo(m.valor)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-tinta">
                  {m.etiqueta}
                  {hayBrecha && m.valor === motivoSugerido ? (
                    <span className="ml-2 text-xs font-normal text-acento">probablemente esto</span>
                  ) : null}
                </span>
                <span className="block text-xs text-tinta-3">{m.explica}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label className="label" htmlFor="aj-nota">
          Nota
        </label>
        <input
          id="aj-nota"
          className="input"
          placeholder="Opcional"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>

      {error ? <p className="mensaje-error">{error}</p> : null}
      {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

      <button type="submit" className="button-primary w-full" disabled={crear.isPending}>
        {crear.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        Declarar saldo
      </button>
    </form>
  );
}

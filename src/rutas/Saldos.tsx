import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useBorrarAjuste, useCrearAjuste, useAjustes } from '@/datos/ajustes';
import { useCrearFuente, useFuentes, useSaldos } from '@/datos/saldos';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { formatearFechaSola, paraInputDate } from '@/lib/fecha';

export default function Saldos() {
  const { mes, zona } = useEstadoApp();
  const { data: fuentes = [] } = useFuentes();
  const saldos = useSaldos(mes, zona);
  const ajustes = useAjustes();

  const crearFuente = useCrearFuente();
  const crearAjuste = useCrearAjuste();
  const borrarAjuste = useBorrarAjuste();

  const [nombreFuente, setNombreFuente] = useState('');
  const [tipoFuente, setTipoFuente] = useState('cuenta');
  const [ajuste, setAjuste] = useState({
    fuente_id: '',
    fecha_referencia: paraInputDate(new Date(), zona),
    monto: '',
    nota: '',
  });
  const [error, setError] = useState<string | null>(null);

  const enviarFuente = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    try {
      await crearFuente.mutateAsync({ nombre: nombreFuente, tipo: tipoFuente });
      setNombreFuente('');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo crear la fuente.');
    }
  };

  const enviarAjuste = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    const monto = parsearMonto(ajuste.monto);
    if (monto == null) {
      setError('Indica el monto del ajuste.');
      return;
    }

    try {
      await crearAjuste.mutateAsync({
        fuente_id: ajuste.fuente_id,
        fecha_referencia: ajuste.fecha_referencia,
        monto_ajustado: monto,
        nota: ajuste.nota || null,
      });
      setAjuste((previo) => ({ ...previo, monto: '', nota: '' }));
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el ajuste.');
    }
  };

  return (
    <section className="space-y-5">
      {error ? <p className="mensaje-error">{error}</p> : null}

      <div className="card p-5 sm:p-6">
        <h2 className="text-lg font-bold text-slate-900">Cómo funcionan los saldos</h2>
        <div className="mt-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
          <ol className="space-y-2">
            <li>1. Los movimientos registran ingresos y egresos sobre cada fuente.</li>
            <li>2. Un ajuste manual corta la línea temporal: declara cuánto había en esa fecha.</li>
            <li>3. Desde ahí el saldo se reconstruye sumando y restando movimientos.</li>
          </ol>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Fuentes</h2>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {saldos.data?.map((fuente) => (
            <div key={fuente.fuente_id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate font-semibold text-slate-900">{fuente.nombre}</h3>
                <span className="chip shrink-0 bg-white">{fuente.tipo}</span>
              </div>
              <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
                {formatearCLP(fuente.saldo_actual)}
              </p>
            </div>
          ))}
        </div>

        <form onSubmit={(e) => void enviarFuente(e)} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Nombre de la fuente"
            value={nombreFuente}
            onChange={(e) => setNombreFuente(e.target.value)}
            required
          />
          <select
            className="input sm:w-40"
            value={tipoFuente}
            onChange={(e) => setTipoFuente(e.target.value)}
          >
            <option value="cuenta">Cuenta</option>
            <option value="efectivo">Efectivo</option>
            <option value="credito">Crédito</option>
            <option value="inversion">Inversión</option>
          </select>
          <button type="submit" className="button-primary sm:w-auto" disabled={crearFuente.isPending}>
            {crearFuente.isPending ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Plus size={16} aria-hidden />
            )}
            Agregar
          </button>
        </form>
      </div>

      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">Ajustes de saldo</h2>

        <form onSubmit={(e) => void enviarAjuste(e)} className="mb-5 grid gap-3 sm:grid-cols-2">
          <select
            className="input"
            value={ajuste.fuente_id}
            onChange={(e) => setAjuste({ ...ajuste, fuente_id: e.target.value })}
            required
          >
            <option value="">Elige la fuente</option>
            {fuentes.map((fuente) => (
              <option key={fuente.id} value={fuente.id}>
                {fuente.nombre}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="input"
            value={ajuste.fecha_referencia}
            onChange={(e) => setAjuste({ ...ajuste, fecha_referencia: e.target.value })}
            required
          />

          <input
            className="input"
            inputMode="decimal"
            placeholder="Saldo en esa fecha"
            value={ajuste.monto}
            onChange={(e) => setAjuste({ ...ajuste, monto: e.target.value })}
            required
          />

          <input
            className="input"
            placeholder="Nota (opcional)"
            value={ajuste.nota}
            onChange={(e) => setAjuste({ ...ajuste, nota: e.target.value })}
          />

          <button
            type="submit"
            className="button-primary sm:col-span-2"
            disabled={crearAjuste.isPending}
          >
            {crearAjuste.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Registrar ajuste
          </button>
        </form>

        {ajustes.isPending ? (
          <p className="text-sm text-slate-500">Cargando ajustes…</p>
        ) : ajustes.data?.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            Aún no hay ajustes registrados.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ajustes.data?.map((registro) => (
              <li key={registro.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {registro.fuentes_cuentas?.nombre ?? 'Fuente eliminada'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Desde {formatearFechaSola(registro.fecha_referencia)}
                    {registro.nota ? ` · ${registro.nota}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <strong className="tabular-nums text-slate-900">
                    {formatearCLP(registro.monto_ajustado)}
                  </strong>
                  <button
                    type="button"
                    className="button-ghost px-2 py-1 text-slate-400 hover:text-rose-600"
                    onClick={() => void borrarAjuste.mutateAsync(registro.id)}
                    aria-label="Borrar ajuste"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

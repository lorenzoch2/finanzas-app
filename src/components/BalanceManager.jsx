import { useState } from 'react';
import { CheckCircle2, PlusCircle, RefreshCcw } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { formatCLP } from '../utils/format';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function BalanceManager({ fuentes = [], onUpdated, onFuenteCreated }) {
  const [values, setValues] = useState({});
  const [newFuente, setNewFuente] = useState({ nombre: '', tipo: 'cuenta' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const saveAdjustment = async (fuenteId) => {
    const { monto, fecha } = values[fuenteId] || {};
    if (monto === undefined || monto === '') return;

    setSaving(true);
    setMessage('');

    const payload = {
      fuente_id: fuenteId,
      fecha_referencia: fecha || todayStr(),
      monto_ajustado: Number(monto),
      nota: 'Ajuste manual de saldo',
    };

    const { error } = await supabase.from('ajustes_saldos').insert(payload);
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Ajuste guardado correctamente.');
    setValues((prev) => ({ ...prev, [fuenteId]: { monto: '', fecha: '' } }));
    onUpdated?.();
  };

  const createFuente = async () => {
    const nombre = newFuente.nombre.trim();
    if (!nombre) {
      setMessage('Ingresa un nombre para la fuente.');
      return;
    }

    setSaving(true);
    setMessage('');

    const { error } = await supabase.from('fuentes_cuentas').insert({ nombre, tipo: newFuente.tipo });
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewFuente({ nombre: '', tipo: 'cuenta' });
    setMessage('Fuente creada correctamente.');
    onFuenteCreated?.();
    onUpdated?.();
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Saldos de cuentas</h2>
          <p className="text-sm text-slate-500">Define el monto inicial de cada fuente. Los movimientos actualizan el saldo automáticamente.</p>
        </div>
        <RefreshCcw className="text-slate-400" size={18} />
      </div>

      <div className="mb-6 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-900">Nueva fuente de pago</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <input className="input" value={newFuente.nombre} onChange={(event) => setNewFuente((prev) => ({ ...prev, nombre: event.target.value }))} placeholder="Ej. Banco, Efectivo, Tarjeta" />
          <select className="input" value={newFuente.tipo} onChange={(event) => setNewFuente((prev) => ({ ...prev, tipo: event.target.value }))}>
            <option value="cuenta">Cuenta</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="billetera">Billetera</option>
            <option value="otro">Otro</option>
          </select>
          <button type="button" className="button-primary" onClick={createFuente} disabled={saving}>
            <PlusCircle size={16} /> Crear
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {fuentes.map((fuente) => (
          <div key={fuente.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{fuente.nombre}</p>
                <p className="text-sm text-slate-500">
                  Monto inicial: {formatCLP(fuente.saldoInicial)} &middot; Saldo actual: {formatCLP(fuente.saldoActual)}
                </p>
              </div>
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{fuente.tipo}</span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input w-auto sm:w-44"
                type="date"
                value={values[fuente.id]?.fecha || ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [fuente.id]: { ...prev[fuente.id], fecha: event.target.value },
                  }))
                }
              />
              <input
                className="input flex-1"
                type="number"
                step="0.01"
                placeholder="Nuevo monto inicial"
                value={values[fuente.id]?.monto || ''}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    [fuente.id]: { ...prev[fuente.id], monto: event.target.value },
                  }))
                }
              />
              <button type="button" className="button-primary" onClick={() => saveAdjustment(fuente.id)} disabled={saving}>
                <CheckCircle2 size={16} /> Guardar
              </button>
            </div>
          </div>
        ))}
      </div>

      {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
    </section>
  );
}

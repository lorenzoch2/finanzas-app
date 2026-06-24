import { useState } from 'react';
import { Check, Edit2, Trash2, X } from 'lucide-react';
import { useAjustesSaldos } from '../hooks/useAjustesSaldos';
import { formatCLP } from '../utils/format';

export default function AjustesList({ fuentes = [], refreshKey = 0, onUpdated }) {
  const { ajustes, loading, error, updateAjuste, deleteAjuste } = useAjustesSaldos(refreshKey);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  const fuenteName = (id) => fuentes.find((fuente) => fuente.id === id)?.nombre || 'Fuente sin nombre';

  const startEdit = (ajuste) => {
    setEditingId(ajuste.id);
    setEditForm({
      fuente_id: ajuste.fuente_id || '',
      fecha_referencia: ajuste.fecha_referencia,
      monto_ajustado: String(ajuste.monto_ajustado),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (id) => {
    setSaving(true);
    try {
      await updateAjuste(id, {
        fuente_id: editForm.fuente_id || null,
        fecha_referencia: editForm.fecha_referencia,
        monto_ajustado: Number(editForm.monto_ajustado),
      });
      setEditingId(null);
      setEditForm({});
      onUpdated?.();
    } catch (err) {
      console.error('Error al actualizar ajuste:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este ajuste de saldo?')) return;
    setSaving(true);
    try {
      await deleteAjuste(id);
      onUpdated?.();
    } catch (err) {
      console.error('Error al eliminar ajuste:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-slate-900">Historial de ajustes</h2>
        <p className="text-sm text-slate-500">Puntos de reinicio manual del saldo. Puedes editar monto, fecha y fuente.</p>
      </div>

      {loading ? <p className="text-sm text-slate-500">Cargando ajustes...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {ajustes.map((ajuste) => {
          const isEditing = editingId === ajuste.id;
          return (
            <article key={ajuste.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              {isEditing ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Fuente</span>
                      <select
                        className="input"
                        value={editForm.fuente_id}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, fuente_id: e.target.value }))}
                      >
                        <option value="">Selecciona una fuente</option>
                        {fuentes.map((fuente) => (
                          <option key={fuente.id} value={fuente.id}>
                            {fuente.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Fecha</span>
                      <input
                        className="input"
                        type="date"
                        value={editForm.fecha_referencia}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, fecha_referencia: e.target.value }))}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-medium text-slate-500">Monto</span>
                      <input
                        className="input"
                        type="number"
                        step="0.01"
                        value={editForm.monto_ajustado}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, monto_ajustado: e.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="button-secondary" onClick={cancelEdit} disabled={saving}>
                      <X size={14} /> Cancelar
                    </button>
                    <button type="button" className="button-primary" onClick={() => saveEdit(ajuste.id)} disabled={saving}>
                      <Check size={14} /> Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{fuenteName(ajuste.fuente_id)}</p>
                    <p className="text-xs text-slate-400">{new Date(ajuste.fecha_referencia).toLocaleDateString('es-ES')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-black text-brand-700">{formatCLP(ajuste.monto_ajustado)}</p>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(ajuste)}
                        className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                        title="Editar"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(ajuste.id)}
                        className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {ajuste.nota && !isEditing ? <p className="mt-2 text-sm text-slate-600">{ajuste.nota}</p> : null}
            </article>
          );
        })}
        {!loading && ajustes.length === 0 ? <p className="text-sm text-slate-500">No hay ajustes manuales registrados.</p> : null}
      </div>
    </section>
  );
}

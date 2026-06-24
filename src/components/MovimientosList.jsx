import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Edit, Package } from 'lucide-react';
import { useMovimientos } from '../hooks/useMovimientos';
import { formatCLP } from '../utils/format';
import TransactionEditModal from './TransactionEditModal';

export default function MovimientosList({ fuentes = [], refreshKey = 0, onUpdated }) {
  const { movimientos, loading, error } = useMovimientos(refreshKey);
  const [expandedId, setExpandedId] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const fuenteName = (id) => fuentes.find((fuente) => fuente.id === id)?.nombre || 'Fuente sin nombre';
  const hasItems = (mov) => (mov.items_detalle || []).length > 0;

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Historial de movimientos</h2>
          <p className="text-sm text-slate-500">Registro de ingresos y egresos recientes.</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Cargando movimientos...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {movimientos.map((movimiento) => (
          <div key={movimiento.id}>
            <article className="flex items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {movimiento.tipo === 'ingreso' ? <ArrowUpRight size={16} className="text-emerald-600" /> : <ArrowDownLeft size={16} className="text-rose-600" />}
                  <p className="font-semibold text-slate-900">{movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</p>
                  {hasItems(movimiento) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                      <Package size={12} />
                      {movimiento.items_detalle.length}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">{fuenteName(movimiento.fuente_id)}</p>
                <p className="text-xs text-slate-400">{new Date(movimiento.fecha).toLocaleString('es-ES')}</p>
                {movimiento.nota ? <p className="mt-2 text-sm text-slate-600">{movimiento.nota}</p> : null}
              </div>
              <div className="flex items-start gap-2">
                <p className={`text-lg font-black ${movimiento.tipo === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {movimiento.tipo === 'ingreso' ? '+' : '-'}{formatCLP(movimiento.monto)}
                </p>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingTransaction(movimiento)}
                    className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                    title="Editar"
                  >
                    <Edit size={14} />
                  </button>
                  {hasItems(movimiento) ? (
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === movimiento.id ? null : movimiento.id)}
                      className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      title="Ver detalle"
                    >
                      <ChevronDown size={14} className={expandedId === movimiento.id ? 'rotate-180 transition' : 'transition'} />
                    </button>
                  ) : null}
                </div>
              </div>
            </article>

            {expandedId === movimiento.id && hasItems(movimiento) ? (
              <div className="ml-6 mt-1 space-y-2 border-l-2 border-slate-200 pl-4">
                {movimiento.items_detalle.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-3 text-sm text-slate-700">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{item.nombre_producto || 'Producto sin nombre'}</p>
                        {item.marca ? <p className="text-xs text-slate-500">{item.marca}</p> : null}
                        {item.categoria_id ? <p className="text-xs text-slate-400">Cat: {item.categoria_id}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-slate-900">{formatCLP(item.precio_final || 0)}</p>
                        {item.unidades > 1 ? <p className="text-xs text-slate-500">x{item.unidades}</p> : null}
                      </div>
                    </div>
                    {item.precio_original && item.precio_final && item.precio_original !== item.precio_final ? (
                      <p className="mt-1 text-xs text-amber-600">
                        {formatCLP(item.precio_original)} · desc: {item.descuento_porcentaje > 0 ? `${item.descuento_porcentaje}%` : item.descuento_monto > 0 ? formatCLP(item.descuento_monto) : ''}
                      </p>
                    ) : null}
                    {item.calificacion ? <p className="mt-1 text-xs text-slate-400">Calif: {item.calificacion}/5</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {!loading && movimientos.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay movimientos registrados.</p> : null}
      </div>

      {editingTransaction ? (
        <TransactionEditModal
          transaction={editingTransaction}
          fuentes={fuentes}
          onSaved={() => {
            setEditingTransaction(null);
            setExpandedId(null);
            onUpdated?.();
          }}
          onClose={() => setEditingTransaction(null)}
        />
      ) : null}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { useCategorias } from '../hooks/useCategorias';
import { useTransacciones } from '../hooks/useTransacciones';
import { formatCLP } from '../utils/format';

const emptyItem = () => ({
  nombre_producto: '',
  marca: '',
  categoria_id: '',
  unidades: 1,
  peso_volumen: '',
  precio_unitario: '',
  descuento_tipo: 'ninguno',
  descuento_valor: '',
  calificacion: '',
});

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value, min = 0) => Math.max(value, min);

const getDiscountedUnitPrice = (item) => {
  const base = toNumber(item.precio_unitario);
  const discount = toNumber(item.descuento_valor);
  if (!base) return 0;
  if (item.descuento_tipo === 'porcentaje') return clamp(base - base * (discount / 100));
  if (item.descuento_tipo === 'monto') return clamp(base - discount);
  return base;
};

const getLineTotal = (item) => getDiscountedUnitPrice(item) * toNumber(item.unidades || 1);

const dbItemToFormItem = (dbItem) => ({
  id: dbItem.id,
  nombre_producto: dbItem.nombre_producto || '',
  marca: dbItem.marca || '',
  categoria_id: dbItem.categoria_id || '',
  unidades: dbItem.unidades || 1,
  peso_volumen: dbItem.peso_volumen || '',
  precio_unitario: dbItem.precio_unitario ? String(dbItem.precio_unitario) : '',
  descuento_tipo: dbItem.descuento_porcentaje > 0 ? 'porcentaje' : dbItem.descuento_monto > 0 ? 'monto' : 'ninguno',
  descuento_valor: dbItem.descuento_porcentaje > 0 ? String(dbItem.descuento_porcentaje) : dbItem.descuento_monto > 0 ? String(dbItem.descuento_monto) : '',
  calificacion: dbItem.calificacion != null ? String(dbItem.calificacion) : '',
});

export default function TransactionEditModal({ transaction, fuentes, onSaved, onClose }) {
  const { flatOptions: categorias, loading: categoriasLoading } = useCategorias();
  const { updateTransaction, loading: saving } = useTransacciones();

  const isEgreso = transaction.tipo === 'egreso';
  const hasItems = (transaction.items_detalle || []).length > 0;

  const initialFormItems = hasItems
    ? (transaction.items_detalle || []).map(dbItemToFormItem)
    : [emptyItem()];

  const [isDetailed, setIsDetailed] = useState(isEgreso && hasItems);
  const [form, setForm] = useState({
    tipo: transaction.tipo,
    monto: String(transaction.monto),
    fuente_id: transaction.fuente_id || '',
    fecha: transaction.fecha.slice(0, 16),
    nota: transaction.nota || '',
    items: initialFormItems,
  });
  const [status, setStatus] = useState('');
  const [reviewState, setReviewState] = useState(null);
  const prevDetailed = useRef(isDetailed);

  const categoriasPadre = useMemo(() => categorias.filter((c) => c.parent_id == null), [categorias]);
  const canDetail = form.tipo === 'egreso';

  useEffect(() => {
    if (isDetailed && !prevDetailed.current && canDetail) {
      const total = toNumber(form.monto);
      if (total > 0 && form.items.length === 1 && !form.items[0].precio_unitario) {
        setForm((prev) => ({
          ...prev,
          items: [{ ...prev.items[0], precio_unitario: String(total) }],
        }));
      }
    }
    prevDetailed.current = isDetailed;
  }, [isDetailed]);

  const detailItems = useMemo(
    () =>
      form.items
        .filter((item) => item.nombre_producto || item.precio_unitario || item.descuento_tipo !== 'ninguno')
        .map((item) => ({
          ...(item.id ? { id: item.id } : {}),
          nombre_producto: item.nombre_producto || null,
          marca: item.marca || null,
          categoria_id: item.categoria_id || null,
          unidades: item.unidades ? Number(item.unidades) : null,
          peso_volumen: item.peso_volumen || null,
          precio_original: item.precio_unitario ? Number(item.precio_unitario) : null,
          precio_unitario: item.precio_unitario ? Number(item.precio_unitario) : null,
          descuento_porcentaje: item.descuento_tipo === 'porcentaje' ? Number(item.descuento_valor || 0) : 0,
          descuento_monto: item.descuento_tipo === 'monto' ? Number(item.descuento_valor || 0) : 0,
          precio_final: getDiscountedUnitPrice(item),
          calificacion: item.calificacion === '' ? null : Number(item.calificacion),
        })),
    [form.items],
  );

  const detailTotal = useMemo(
    () => detailItems.reduce((sum, item) => sum + clamp((item.precio_final || 0) * (item.unidades || 1)), 0),
    [detailItems],
  );
  const enteredTotal = toNumber(form.monto);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateItem = (index, field, value) => {
    setReviewState(null);
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  };
  const addItem = () => setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  const removeItem = (index) =>
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const buildPayload = () => {
    const diff = clamp(detailTotal - enteredTotal);
    const missing = clamp(enteredTotal - detailTotal);
    const finalAmount = canDetail && isDetailed
      ? (diff > 0 ? detailTotal : enteredTotal)
      : enteredTotal;

    const detailedRows = canDetail && isDetailed
      ? [
          ...detailItems,
          ...(missing > 0
            ? [{
                nombre_producto: 'Gasto sin detalle',
                marca: null,
                categoria_id: null,
                unidades: 1,
                peso_volumen: null,
                precio_original: missing,
                precio_unitario: missing,
                descuento_porcentaje: 0,
                descuento_monto: 0,
                precio_final: missing,
                calificacion: null,
              }]
            : []),
        ]
      : [];

    return { diff, missing, finalAmount, detailedRows };
  };

  const applyReviewDecision = async (decision) => {
    if (!reviewState) return;
    if (decision === 'use_detail_total') {
      const built = buildPayload();
      try {
        await updateTransaction({
          id: transaction.id,
          transaccion: {
            tipo: form.tipo,
            monto: reviewState.detailTotal,
            fecha: new Date(form.fecha).toISOString(),
            fuente_id: form.fuente_id || null,
            nota: form.nota || null,
          },
          items: built.detailedRows.filter((r) => r.nombre_producto !== 'Gasto sin detalle' || true),
        });
        setStatus('Transacción actualizada.');
        onSaved?.();
      } catch (err) {
        setStatus(err.message || 'No se pudo actualizar la transacción.');
      }
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus('');

    const built = buildPayload();
    const detailTotalRounded = Number(built.finalAmount.toFixed(2));
    const enteredRounded = Number(enteredTotal.toFixed(2));

    if (canDetail && isDetailed) {
      if (!enteredTotal && !detailItems.length) {
        setStatus('Ingresa un monto total o al menos un ítem detallado.');
        return;
      }

      if (detailTotalRounded > enteredRounded) {
        setReviewState({
          enteredTotal: enteredRounded,
          detailTotal: detailTotalRounded,
          detailedRows: built.detailedRows,
        });
        setStatus('El detalle supera el total ingresado. Ajusta el monto o revisa el detalle antes de guardar.');
        return;
      }

      if (detailTotalRounded < enteredRounded) {
        setStatus('El sobrante se registrará automáticamente como gasto sin detalle.');
      }
    }

    try {
      const payloadAmount = built.detailedRows.length ? built.finalAmount : enteredTotal;

      await updateTransaction({
        id: transaction.id,
        transaccion: {
          tipo: form.tipo,
          monto: canDetail && isDetailed ? payloadAmount : enteredTotal,
          fecha: new Date(form.fecha).toISOString(),
          fuente_id: form.fuente_id || null,
          nota: form.nota || null,
        },
        items: canDetail && isDetailed ? built.detailedRows : [],
      });

      setStatus('Transacción actualizada.');
      onSaved?.();
    } catch (err) {
      setStatus(err.message || 'No se pudo actualizar la transacción.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
      <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Editar transacción</h2>
          <button type="button" onClick={onClose} className="text-slate-400 transition hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="space-y-2">
              <span className="label">Tipo</span>
              <select className="input" value={form.tipo} disabled>
                <option value="egreso">Gasto</option>
                <option value="ingreso">Ingreso</option>
              </select>
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="label">Monto total</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.monto}
                onChange={(event) => updateField('monto', event.target.value)}
                placeholder="0.00"
                readOnly={canDetail && isDetailed}
              />
            </label>
            <label className="space-y-2">
              <span className="label">Fecha</span>
              <input className="input" type="datetime-local" value={form.fecha} onChange={(event) => updateField('fecha', event.target.value)} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="label">Fuente de pago</span>
              <select className="input" value={form.fuente_id} onChange={(event) => updateField('fuente_id', event.target.value)}>
                <option value="">Selecciona una fuente</option>
                {fuentes.map((fuente) => (
                  <option key={fuente.id} value={fuente.id}>
                    {fuente.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="label">Nota</span>
              <input className="input" value={form.nota} onChange={(event) => updateField('nota', event.target.value)} placeholder="Contexto opcional" />
            </label>
          </div>

          {canDetail ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setIsDetailed((value) => !value)} className="button-secondary">
                <ChevronDown size={16} className={isDetailed ? 'rotate-180 transition' : 'transition'} />
                {isDetailed ? 'Ocultar detalle' : 'Detallar gasto'}
              </button>
            </div>
          ) : null}

          {!canDetail ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
              Los ingresos se registran sin detalle.
            </div>
          ) : null}

          {isDetailed && canDetail ? (
            <div className="space-y-4 rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Desglose de gasto</h3>
                  <p className="text-sm text-slate-500">Si el detalle no cubre el total, el sobrante se registra sin detalle.</p>
                </div>
                <button type="button" className="button-secondary" onClick={addItem}>
                  <Plus size={16} /> Agregar ítem
                </button>
              </div>

              {form.items.map((item, index) => (
                <div key={item.id || index} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Ítem {index + 1}</p>
                    {form.items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)} className="text-slate-400 transition hover:text-red-500">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <input className="input" placeholder="Producto o servicio" value={item.nombre_producto} onChange={(event) => updateItem(index, 'nombre_producto', event.target.value)} />
                    <input className="input" placeholder="Marca" value={item.marca} onChange={(event) => updateItem(index, 'marca', event.target.value)} />
                    <select className="input" value={item.categoria_id} onChange={(event) => updateItem(index, 'categoria_id', event.target.value)}>
                      <option value="">Categoría</option>
                      {categoriasLoading ? (
                        <option>Cargando...</option>
                      ) : (
                        categoriasPadre.map((categoriaPadre) => (
                          <optgroup key={categoriaPadre.id} label={categoriaPadre.nombre}>
                            <option value={categoriaPadre.id}>{categoriaPadre.nombre}</option>
                            {categorias
                              .filter((child) => child.parent_id === categoriaPadre.id)
                              .map((child) => (
                                <option key={child.id} value={child.id}>
                                  {categoriaPadre.nombre} &gt; {child.nombre}
                                </option>
                              ))}
                          </optgroup>
                        ))
                      )}
                    </select>
                    <input className="input" type="number" min="0" step="0.01" placeholder="Costo unitario" value={item.precio_unitario} onChange={(event) => updateItem(index, 'precio_unitario', event.target.value)} />
                    <input className="input" type="number" min="0" step="0.01" placeholder="Unidades" value={item.unidades} onChange={(event) => updateItem(index, 'unidades', event.target.value)} />
                    <input className="input" placeholder="Peso / volumen" value={item.peso_volumen} onChange={(event) => updateItem(index, 'peso_volumen', event.target.value)} />
                    <select className="input" value={item.descuento_tipo} onChange={(event) => updateItem(index, 'descuento_tipo', event.target.value)}>
                      <option value="ninguno">Sin descuento</option>
                      <option value="porcentaje">Descuento %</option>
                      <option value="monto">Descuento $</option>
                    </select>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={item.descuento_tipo === 'porcentaje' ? 'Porcentaje' : item.descuento_tipo === 'monto' ? 'Monto' : 'Descuento'}
                      value={item.descuento_valor}
                      onChange={(event) => updateItem(index, 'descuento_valor', event.target.value)}
                      disabled={item.descuento_tipo === 'ninguno'}
                    />
                    <input className="input" type="number" min="1" max="5" placeholder="Calificación" value={item.calificacion} onChange={(event) => updateItem(index, 'calificacion', event.target.value)} />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2 lg:col-span-4">
                      Neto unitario: <span className="font-semibold text-slate-900">{formatCLP(getDiscountedUnitPrice(item))}</span>
                      <span className="ml-4 text-slate-500">Total ítem: {formatCLP(getLineTotal(item))}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm text-slate-600">
                <span>Total detalle</span>
                <span className="text-base font-black text-slate-900">{formatCLP(detailTotal)}</span>
              </div>
            </div>
          ) : null}

          {canDetail && isDetailed ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Conciliación</p>
              <p className="mt-1">Monto ingresado: {formatCLP(enteredTotal)} · Detalle: {formatCLP(detailTotal)}</p>
              <p className="mt-1 text-amber-800">Si el detalle es menor, el sobrante se agrega como gasto sin detalle. Si el detalle supera el total, se te pedirá confirmar.</p>
            </div>
          ) : null}

          {reviewState ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="font-semibold text-slate-900">Incompatibilidad detectada</p>
              <p className="mt-1 text-sm text-slate-600">
                Total ingresado: {formatCLP(reviewState.enteredTotal)} · Detalle: {formatCLP(reviewState.detailTotal)}
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button type="button" className="button-primary" onClick={() => applyReviewDecision('use_detail_total')}>
                  Adecuar monto al detalle
                </button>
                <button type="button" className="button-secondary" onClick={() => setReviewState(null)}>
                  Volver a editar
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">{status || ''}</span>
            </div>
            <div className="flex gap-3">
              <button type="button" className="button-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="button-primary" disabled={saving || !!reviewState}>
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

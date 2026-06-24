import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useCategorias } from '../hooks/useCategorias';

const emptyForm = { nombre: '', parent_id: '' };

export default function CategoriesManager() {
  const { tree, flatOptions, loading, error, createCategoria, updateCategoria, deleteCategoria } = useCategorias();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const parents = useMemo(() => flatOptions.filter((item) => item.parent_id == null), [flatOptions]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');

    try {
      if (editingId) {
        await updateCategoria(editingId, { nombre: form.nombre, parent_id: form.parent_id || null });
        setNotice('Categoría actualizada.');
      } else {
        await createCategoria({ nombre: form.nombre, parent_id: form.parent_id || null });
        setNotice('Categoría creada.');
      }
      reset();
    } catch (err) {
      setNotice(err.message || 'No se pudo guardar la categoría.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (category) => {
    setEditingId(category.id);
    setForm({ nombre: category.nombre, parent_id: category.parent_id || '' });
  };

  const handleDelete = async (category) => {
    const confirmed = window.confirm(`Eliminar "${category.nombre}" borrará también sus subcategorías y dejará productos sin categoría. ¿Continuar?`);
    if (!confirmed) return;

    setBusy(true);
    setNotice('');
    try {
      await deleteCategoria(category.id);
      setNotice('Categoría eliminada.');
      if (editingId === category.id) reset();
    } catch (err) {
      setNotice(err.message || 'No se pudo eliminar la categoría.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Categorías</h2>
          <p className="text-sm text-slate-500">Crea, edita y elimina categorías madre o subcategorías.</p>
        </div>
        <span className="rounded-2xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700">{flatOptions.length} ítems</span>
      </div>

      <form onSubmit={submit} className="mb-6 space-y-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
          <input className="input" value={form.nombre} onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))} placeholder="Nombre de categoría" />
          <select className="input" value={form.parent_id} onChange={(event) => setForm((prev) => ({ ...prev, parent_id: event.target.value }))}>
            <option value="">Categoría madre</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.label}
              </option>
            ))}
          </select>
          <button type="submit" className="button-primary" disabled={busy || loading}>
            <Plus size={16} /> {editingId ? 'Actualizar' : 'Crear'}
          </button>
        </div>
        {editingId ? (
          <button type="button" className="button-secondary" onClick={reset}>
            Cancelar edición
          </button>
        ) : null}
      </form>

      {notice ? <p className="mb-4 text-sm text-slate-600">{notice}</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {tree.map((category) => (
          <CategoryNode key={category.id} category={category} onEdit={startEdit} onDelete={handleDelete} />
        ))}
        {!loading && tree.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay categorías.</p> : null}
      </div>
    </section>
  );
}

function CategoryNode({ category, onEdit, onDelete, level = 0 }) {
  return (
    <div className={level === 0 ? '' : 'ml-6 border-l border-slate-200 pl-4'}>
      <div className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4">
        <div>
          <p className="font-semibold text-slate-900">{category.nombre}</p>
          <p className="text-xs text-slate-500">{level === 0 ? 'Categoría madre' : 'Subcategoría'}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="button-secondary" onClick={() => onEdit(category)}>
            <Pencil size={16} />
          </button>
          <button type="button" className="button-secondary text-red-600 hover:bg-red-50" onClick={() => onDelete(category)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {category.children?.map((child) => (
        <CategoryNode key={child.id} category={child} onEdit={onEdit} onDelete={onDelete} level={level + 1} />
      ))}
    </div>
  );
}

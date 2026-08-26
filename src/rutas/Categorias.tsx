import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useBorrarCategoria,
  useCategorias,
  useCrearCategoria,
  useEditarCategoria,
} from '@/datos/categorias';

export default function Categorias() {
  const { opciones, isPending, error: errorCarga } = useCategorias();
  const crear = useCrearCategoria();
  const editar = useEditarCategoria();
  const borrar = useBorrarCategoria();

  const [nombre, setNombre] = useState('');
  const [padre, setPadre] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({ nombre, parent_id: padre || null });
      setNombre('');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo crear la categoría.');
    }
  };

  const guardarEdicion = async (id: string) => {
    setError(null);
    const actual = opciones.find((categoria) => categoria.id === id);
    try {
      await editar.mutateAsync({ id, nombre: nombreEditado, parent_id: actual?.parent_id ?? null });
      setEditandoId(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    }
  };

  const pedirBorrado = async (id: string) => {
    if (confirmando !== id) {
      setConfirmando(id);
      window.setTimeout(() => setConfirmando((actual) => (actual === id ? null : actual)), 4000);
      return;
    }

    setError(null);
    try {
      await borrar.mutateAsync(id);
      setConfirmando(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo borrar.');
    }
  };

  return (
    <section className="space-y-5">
      {error ? <p className="mensaje-error">{error}</p> : null}
      {errorCarga ? (
        <p className="mensaje-error">
          {errorCarga instanceof Error ? errorCarga.message : 'Error al cargar categorías.'}
        </p>
      ) : null}

      <form onSubmit={(e) => void enviar(e)} className="card flex flex-col gap-2 p-5 sm:flex-row sm:p-6">
        <input
          className="input flex-1"
          placeholder="Nueva categoría"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <select className="input sm:w-56" value={padre} onChange={(e) => setPadre(e.target.value)}>
          <option value="">Sin categoría padre</option>
          {opciones.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.ruta}
            </option>
          ))}
        </select>
        <button type="submit" className="button-primary sm:w-auto" disabled={crear.isPending}>
          {crear.isPending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Plus size={16} aria-hidden />
          )}
          Agregar
        </button>
      </form>

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-slate-900">Categorías</h2>
          <span className="text-sm text-slate-500">{opciones.length}</span>
        </div>

        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…
          </p>
        ) : opciones.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay categorías.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {opciones.map((categoria) => (
              <li key={categoria.id} className="flex items-center gap-2 py-2.5">
                <div
                  className="min-w-0 flex-1"
                  style={{ paddingLeft: `${categoria.profundidad * 1.25}rem` }}
                >
                  {editandoId === categoria.id ? (
                    <input
                      className="input py-2"
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void guardarEdicion(categoria.id);
                        if (e.key === 'Escape') setEditandoId(null);
                      }}
                    />
                  ) : (
                    <span className="truncate font-medium text-slate-800">{categoria.nombre}</span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {editandoId === categoria.id ? (
                    <>
                      <button
                        type="button"
                        className="button-ghost px-2 py-1 text-emerald-600"
                        onClick={() => void guardarEdicion(categoria.id)}
                        aria-label="Guardar"
                      >
                        <Check size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="button-ghost px-2 py-1"
                        onClick={() => setEditandoId(null)}
                        aria-label="Cancelar"
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button-ghost px-2 py-1 text-slate-400"
                        onClick={() => {
                          setEditandoId(categoria.id);
                          setNombreEditado(categoria.nombre);
                        }}
                        aria-label={`Editar ${categoria.nombre}`}
                      >
                        <Pencil size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className={`button-ghost px-2 py-1 ${
                          confirmando === categoria.id ? 'text-rose-700' : 'text-slate-400'
                        }`}
                        onClick={() => void pedirBorrado(categoria.id)}
                        aria-label={`Borrar ${categoria.nombre}`}
                      >
                        {confirmando === categoria.id ? (
                          <span className="text-xs font-semibold">¿Seguro?</span>
                        ) : (
                          <Trash2 size={16} aria-hidden />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Borrar una categoría arrastra sus subcategorías. Los ítems que la usaban no se borran:
          quedan sin categoría.
        </p>
      </div>
    </section>
  );
}

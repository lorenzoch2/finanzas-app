import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useBorrarCategoria,
  useCategorias,
  useCrearCategoria,
  useEditarCategoria,
} from '@/datos/categorias';
import type { Categoria } from '@/lib/database.types';

/**
 * Categorías, agrupadas por su principal.
 *
 * Con 51 categorías, una lista plana obliga a recorrerla entera para encontrar
 * algo. Agrupadas y plegables se ven las 10 principales de un vistazo y se
 * abre solo la que interesa.
 */

export default function Categorias() {
  const { categorias, isPending, error: errorCarga } = useCategorias();
  const crear = useCrearCategoria();
  const editar = useEditarCategoria();
  const borrar = useBorrarCategoria();

  const [nombre, setNombre] = useState('');
  const [padre, setPadre] = useState('');
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { principales, hijasPorPadre } = useMemo(() => {
    const principales = categorias
      .filter((c) => c.parent_id === null)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    const hijasPorPadre = new Map<string, Categoria[]>();
    for (const c of categorias) {
      if (!c.parent_id) continue;
      const lista = hijasPorPadre.get(c.parent_id) ?? [];
      lista.push(c);
      hijasPorPadre.set(c.parent_id, lista);
    }
    for (const lista of hijasPorPadre.values()) {
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    return { principales, hijasPorPadre };
  }, [categorias]);

  const alternar = (id: string) =>
    setAbiertas((previas) => {
      const siguiente = new Set(previas);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    try {
      await crear.mutateAsync({ nombre, parent_id: padre || null });
      setNombre('');
      if (padre) setAbiertas((p) => new Set(p).add(padre));
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo crear la categoría.');
    }
  };

  const guardarEdicion = async (categoria: Categoria) => {
    setError(null);
    try {
      await editar.mutateAsync({
        id: categoria.id,
        nombre: nombreEditado,
        parent_id: categoria.parent_id,
      });
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

  const Acciones = ({ categoria }: { categoria: Categoria }) => (
    <div className="flex shrink-0 items-center gap-1">
      {editandoId === categoria.id ? (
        <>
          <button
            type="button"
            className="button-ghost px-2 py-1 text-emerald-600"
            onClick={() => void guardarEdicion(categoria)}
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
            <Pencil size={15} aria-hidden />
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
              <Trash2 size={15} aria-hidden />
            )}
          </button>
        </>
      )}
    </div>
  );

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
          <option value="">Como categoría principal</option>
          {principales.map((c) => (
            <option key={c.id} value={c.id}>
              Dentro de {c.nombre}
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
          <span className="text-sm text-slate-500">
            {principales.length} principales · {categorias.length - principales.length} subcategorías
          </span>
        </div>

        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…
          </p>
        ) : principales.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            Todavía no hay categorías.
          </p>
        ) : (
          <ul className="space-y-2">
            {principales.map((principal) => {
              const hijas = hijasPorPadre.get(principal.id) ?? [];
              const abierta = abiertas.has(principal.id);

              return (
                <li key={principal.id} className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 bg-slate-50 px-3 py-2.5">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => alternar(principal.id)}
                      aria-expanded={abierta}
                    >
                      <ChevronDown
                        size={16}
                        aria-hidden
                        className={`shrink-0 text-slate-400 transition ${abierta ? 'rotate-180' : ''}`}
                      />
                      {editandoId === principal.id ? (
                        <input
                          className="input py-1.5"
                          value={nombreEditado}
                          onChange={(e) => setNombreEditado(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span className="truncate font-semibold text-slate-800">
                          {principal.nombre}
                        </span>
                      )}
                      <span className="shrink-0 text-xs text-slate-400">{hijas.length}</span>
                    </button>

                    <Acciones categoria={principal} />
                  </div>

                  {abierta ? (
                    <ul className="divide-y divide-slate-100 bg-white">
                      {hijas.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-slate-400">Sin subcategorías.</li>
                      ) : (
                        hijas.map((hija) => (
                          <li key={hija.id} className="flex items-center gap-2 py-2 pr-3 pl-9">
                            <div className="min-w-0 flex-1">
                              {editandoId === hija.id ? (
                                <input
                                  className="input py-1.5"
                                  value={nombreEditado}
                                  onChange={(e) => setNombreEditado(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void guardarEdicion(hija);
                                    if (e.key === 'Escape') setEditandoId(null);
                                  }}
                                />
                              ) : (
                                <span className="truncate text-sm text-slate-700">{hija.nombre}</span>
                              )}
                            </div>
                            <Acciones categoria={hija} />
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
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

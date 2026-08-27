import { useId, useMemo } from 'react';
import { useCategorias } from '@/datos/categorias';

/**
 * Categoría y subcategoría en dos pasos.
 *
 * Antes era una sola lista plana con la ruta completa («Supermercado y
 * despensa › Lácteos y huevos»). Con 41 subcategorías eso es un desplegable de
 * 41 líneas donde hay que leer para encontrar, y en un teléfono es peor.
 *
 * En dos pasos se eligen 10 y luego 4 o 5. Además impide una combinación
 * imposible: al cambiar de categoría, la subcategoría que ya no pertenece se
 * limpia sola, en vez de quedarse colgada de un padre que no le corresponde.
 *
 * Lo que se guarda sigue siendo un único `categoria_id`, el de la
 * subcategoría: la jerarquía ya vive en la base a través de `parent_id`.
 */

interface Props {
  valor: string;
  onCambiar: (categoriaId: string) => void;
  etiquetaCategoria?: string;
  etiquetaSubcategoria?: string;
  requerido?: boolean;
}

export default function SelectorCategoria({
  valor,
  onCambiar,
  etiquetaCategoria = 'Categoría',
  etiquetaSubcategoria = 'Subcategoría',
  requerido = false,
}: Props) {
  const id = useId();
  const { categorias } = useCategorias();

  const principales = useMemo(
    () =>
      categorias
        .filter((c) => c.parent_id === null)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categorias],
  );

  // El padre no se guarda: se deduce de la subcategoría elegida. Así no hay
  // dos fuentes de verdad que puedan contradecirse.
  const padreActual = useMemo(() => {
    const sub = categorias.find((c) => c.id === valor);
    return sub?.parent_id ?? '';
  }, [categorias, valor]);

  const hijas = useMemo(
    () =>
      categorias
        .filter((c) => c.parent_id === padreActual)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categorias, padreActual],
  );

  const cambiarPadre = (nuevoPadre: string) => {
    if (!nuevoPadre) {
      onCambiar('');
      return;
    }

    const primeraHija = categorias.find((c) => c.parent_id === nuevoPadre);
    // Se preselecciona la primera subcategoría en vez de dejar el campo vacío:
    // ahorra un toque y evita guardar una categoría a medio elegir.
    onCambiar(primeraHija?.id ?? '');
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <label className="label" htmlFor={`${id}-padre`}>
          {etiquetaCategoria}
        </label>
        <select
          id={`${id}-padre`}
          className="input"
          value={padreActual}
          onChange={(e) => cambiarPadre(e.target.value)}
          required={requerido}
        >
          <option value="">Sin categoría</option>
          {principales.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="label" htmlFor={`${id}-hija`}>
          {etiquetaSubcategoria}
        </label>
        <select
          id={`${id}-hija`}
          className="input"
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          disabled={!padreActual}
          required={requerido && Boolean(padreActual)}
        >
          {!padreActual ? <option value="">Elige antes una categoría</option> : null}
          {hijas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

import { useId, useMemo, useRef, useState } from 'react';
import { Check, Package, Plus } from 'lucide-react';
import { buscarProductos, useProductos } from '@/datos/productos';
import type { ProductoBuscado } from '@/datos/productos';

/**
 * Campo de producto con búsqueda en el catálogo.
 *
 * Es la pieza que hace posible comparar precios entre establecimientos: sin
 * una identidad estable, «Leche Entera Colún» comprada en dos sitios son dos
 * cosas distintas y no hay nada que comparar. Los datos históricos ya traían
 * «Colún» y «Colun» como productos separados.
 *
 * También es más rápido de usar que escribir el nombre entero: repetir una
 * compra habitual pasa a ser un toque. Eso importa porque el formulario se
 * llena de pie en la caja del supermercado.
 *
 * Si lo que se escribe no está en el catálogo, no se bloquea nada: se guarda
 * como texto y el producto se crea al confirmar la transacción.
 */

interface Props {
  valor: string;
  productoId: string;
  onCambiar: (datos: { nombre: string; producto: ProductoBuscado | null }) => void;
  id?: string;
  placeholder?: string;
}

export default function ComboboxProducto({
  valor,
  productoId,
  onCambiar,
  id,
  placeholder = 'Producto',
}: Props) {
  const generado = useId();
  const idCampo = id ?? generado;
  const { conEtiqueta } = useProductos();

  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const sugerencias = useMemo(
    () => (abierto ? buscarProductos(conEtiqueta, valor) : []),
    [abierto, conEtiqueta, valor],
  );

  const elegir = (producto: ProductoBuscado) => {
    onCambiar({ nombre: producto.nombre, producto });
    setAbierto(false);
  };

  const alTeclear = (evento: React.KeyboardEvent<HTMLInputElement>) => {
    if (!abierto || sugerencias.length === 0) return;

    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setResaltado((n) => (n + 1) % sugerencias.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setResaltado((n) => (n - 1 + sugerencias.length) % sugerencias.length);
    } else if (evento.key === 'Enter') {
      // Enter elige de la lista en vez de enviar el formulario, que sería
      // perder la boleta a medio escribir.
      const elegido = sugerencias[resaltado];
      if (elegido) {
        evento.preventDefault();
        elegir(elegido);
      }
    } else if (evento.key === 'Escape') {
      setAbierto(false);
    }
  };

  const esNuevo = valor.trim().length > 0 && !productoId;

  return (
    <div ref={contenedor} className="relative">
      <label className="sr-only" htmlFor={idCampo}>
        {placeholder}
      </label>

      <div className="relative">
        <input
          id={idCampo}
          className="input pr-9"
          placeholder={placeholder}
          value={valor}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          aria-controls={`${idCampo}-lista`}
          onChange={(e) => {
            // Al escribir se suelta el vínculo con el catálogo: lo que hay en
            // el campo ya no es el producto que se habia elegido.
            onCambiar({ nombre: e.target.value, producto: null });
            setAbierto(true);
            setResaltado(0);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
          onKeyDown={alTeclear}
        />

        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
          {productoId ? (
            <Check size={16} className="text-emerald-600" aria-label="Del catálogo" />
          ) : esNuevo ? (
            <Plus size={16} className="text-brand-500" aria-label="Producto nuevo" />
          ) : (
            <Package size={16} className="text-slate-300" aria-hidden />
          )}
        </span>
      </div>

      {abierto && sugerencias.length > 0 ? (
        <ul
          id={`${idCampo}-lista`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-soft"
        >
          {sugerencias.map((producto, indice) => (
            <li key={producto.id}>
              <button
                type="button"
                role="option"
                aria-selected={indice === resaltado}
                className={`flex w-full items-baseline justify-between gap-2 px-4 py-2.5 text-left text-sm ${
                  indice === resaltado ? 'bg-brand-50 text-brand-900' : 'text-slate-700'
                }`}
                // onMouseDown, no onClick: el blur del input dispara antes que
                // el click y cerraria la lista sin llegar a elegir nada.
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(producto);
                }}
                onMouseEnter={() => setResaltado(indice)}
              >
                <span className="min-w-0 truncate">{producto.nombre}</span>
                {producto.marca || producto.contenido_cantidad ? (
                  <span className="shrink-0 text-xs text-slate-400">
                    {[
                      producto.marca,
                      producto.contenido_cantidad
                        ? `${producto.contenido_cantidad} ${producto.contenido_unidad === 'unidad' ? 'u' : producto.contenido_unidad}`
                        : null,
                      producto.vendido_por === 'peso' ? 'a granel' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {esNuevo ? (
        <p className="mt-1 text-xs text-brand-600">Producto nuevo: se añadirá al catálogo.</p>
      ) : null}
    </div>
  );
}

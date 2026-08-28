import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useHistorialProducto } from '@/datos/analisis';
import { useProductos } from '@/datos/productos';
import { etiquetaDe } from '@/datos/productos';
import { formatearCLP } from '@/lib/dinero';

/**
 * Precio de un producto: cómo cambia en el tiempo y dónde sale más barato.
 *
 * Es la razón de ser del catálogo de productos. Sin identidad estable, «Leche
 * Entera Colún» comprada en dos sitios son dos cosas distintas y no hay nada
 * que comparar; con ella, la misma compra repetida se convierte en una serie.
 *
 * El precio se normaliza por unidad de medida cuando el producto declara su
 * contenido: 500 g a $3.690 y 1 kg a $6.900 solo son comparables llevados
 * ambos a precio por kilo. Cuando no hay contenido declarado se muestra el
 * precio tal cual, en vez de inventar una equivalencia.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fechaCorta = (iso: string): string => {
  const f = new Date(iso);
  return `${f.getUTCDate()} ${MESES[f.getUTCMonth()]}`;
};

export default function PrecioProducto() {
  const { conEtiqueta } = useProductos();
  const [productoId, setProductoId] = useState('');
  const historial = useHistorialProducto(productoId || null);

  const compras = historial.data ?? [];

  /**
   * Solo los productos con más de una compra: con una sola no hay evolución
   * ni comparación posible, y llenar el desplegable con ellos obliga a
   * buscar entre opciones que no llevan a ninguna parte.
   *
   * Como la lista de compras solo se conoce al elegir, se ofrecen todos y se
   * avisa después. Es el precio de no bajar el historial entero por
   * adelantado.
   */
  const opciones = useMemo(
    () => [...conEtiqueta].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [conEtiqueta],
  );

  const porEstablecimiento = useMemo(() => {
    const mapa = new Map<string, { suma: number; veces: number; unidad: string | null }>();

    for (const c of compras) {
      const precio = c.precio_por_medida ?? c.precio_final;
      const actual = mapa.get(c.establecimiento) ?? {
        suma: 0,
        veces: 0,
        unidad: c.precio_por_medida != null ? c.unidad_medida : null,
      };
      actual.suma += Number(precio);
      actual.veces += 1;
      mapa.set(c.establecimiento, actual);
    }

    return [...mapa.entries()]
      .map(([nombre, { suma, veces, unidad }]) => ({
        nombre,
        promedio: suma / veces,
        veces,
        unidad,
      }))
      .sort((a, b) => a.promedio - b.promedio);
  }, [compras]);

  const variacion = useMemo(() => {
    if (compras.length < 2) return null;
    const primera = compras[0];
    const ultima = compras[compras.length - 1];
    if (!primera || !ultima) return null;

    const desde = Number(primera.precio_por_medida ?? primera.precio_final);
    const hasta = Number(ultima.precio_por_medida ?? ultima.precio_final);
    if (desde === 0) return null;

    return { desde, hasta, porcentaje: ((hasta - desde) / desde) * 100 };
  }, [compras]);

  const unidad = compras.find((c) => c.precio_por_medida != null)?.unidad_medida ?? null;
  const etiquetaPrecio = unidad ? `por ${unidad}` : 'por unidad';

  return (
    <div>
      <label className="sr-only" htmlFor="producto-historial">
        Producto a seguir
      </label>
      <select
        id="producto-historial"
        className="input"
        value={productoId}
        onChange={(e) => setProductoId(e.target.value)}
      >
        <option value="">Elige un producto…</option>
        {opciones.map((p) => (
          <option key={p.id} value={p.id}>
            {etiquetaDe(p)}
          </option>
        ))}
      </select>

      {!productoId ? (
        <p className="mt-4 rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
          Elige un producto para ver cómo ha cambiado su precio y en qué local sale más barato.
        </p>
      ) : compras.length === 0 ? (
        <p className="mt-4 rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
          Todavía no hay compras registradas de este producto.
        </p>
      ) : compras.length === 1 ? (
        <p className="mt-4 rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
          Solo hay una compra de este producto, así que no hay con qué compararla. Al comprarlo otra
          vez podrás ver si subió y dónde conviene.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {variacion ? (
            <div
              className={`flex items-center gap-3 rounded-campo px-4 py-3 ${
                variacion.porcentaje > 0
                  ? 'bg-sale-suave text-sale'
                  : variacion.porcentaje < 0
                    ? 'bg-entra-suave text-entra'
                    : 'bg-elevado text-tinta-2'
              }`}
            >
              {variacion.porcentaje > 0 ? (
                <TrendingUp size={18} className="shrink-0" aria-hidden />
              ) : (
                <TrendingDown size={18} className="shrink-0" aria-hidden />
              )}
              <p className="text-sm">
                De {formatearCLP(variacion.desde)} a {formatearCLP(variacion.hasta)} {etiquetaPrecio}
                {' · '}
                <strong>
                  {variacion.porcentaje > 0 ? '+' : ''}
                  {variacion.porcentaje.toFixed(1)}%
                </strong>
              </p>
            </div>
          ) : null}

          {/* Dónde sale más barato: lo ordenado de menor a mayor ya responde. */}
          {porEstablecimiento.length > 1 ? (
            <div>
              <p className="mb-2 text-xs font-semibold text-tinta-3">
                Precio medio {etiquetaPrecio} por local
              </p>
              <ul className="divide-y divide-borde-suave">
                {porEstablecimiento.map((e, indice) => (
                  <li key={e.nombre} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm text-tinta-2">
                      {e.nombre}
                      {indice === 0 ? (
                        <span className="ml-2 text-xs font-medium text-entra">más barato</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">
                      {formatearCLP(e.promedio)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-semibold text-tinta-3">Cada compra</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borde-suave text-left text-xs text-tinta-3">
                    <th className="py-2 pr-3 font-medium">Fecha</th>
                    <th className="py-2 pr-3 font-medium">Dónde</th>
                    <th className="py-2 text-right font-medium">Precio {etiquetaPrecio}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde-suave">
                  {compras.map((c, indice) => (
                    <tr key={`${c.fecha}-${indice}`}>
                      <td className="py-2 pr-3 text-tinta-2">{fechaCorta(c.fecha)}</td>
                      <td className="py-2 pr-3 text-tinta-2">{c.establecimiento}</td>
                      <td className="py-2 text-right font-medium tabular-nums text-tinta">
                        {formatearCLP(c.precio_por_medida ?? c.precio_final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

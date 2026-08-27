import { useWatch } from 'react-hook-form';
import type { Control, UseFormRegister } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import type { CategoriaConRuta } from '@/datos/categorias';
import type { ValoresTransaccion } from './esquemaTransaccion';
import { descuentoDeItem, totalDeItem } from './esquemaTransaccion';
import { formatearCLP, parsearMonto, porcentajeDescuento, precioConDescuento } from '@/lib/dinero';

/**
 * Una línea de la boleta.
 *
 * Es un componente aparte por rendimiento: se suscribe con `useWatch` solo a
 * SUS campos, así que escribir en el ítem 3 no redibuja los otros diecinueve.
 * Antes el formulario hacía `watch('items')` en el padre y cada tecla
 * re-renderizaba la lista entera, que en un teléfono con una boleta larga se
 * nota.
 *
 * Todos los campos llevan `<label>` real, aunque visualmente se apoyen en el
 * placeholder: sin ellos un lector de pantalla no anuncia nada, y al escribir
 * se pierde de vista qué campo era.
 */

interface Props {
  control: Control<ValoresTransaccion>;
  register: UseFormRegister<ValoresTransaccion>;
  indice: number;
  categorias: CategoriaConRuta[];
  puedeQuitar: boolean;
  onQuitar: () => void;
}

export default function FilaItem({
  control,
  register,
  indice,
  categorias,
  puedeQuitar,
  onQuitar,
}: Props) {
  const item = useWatch({ control, name: `items.${indice}` });

  const precio = parsearMonto(item?.precio_unitario ?? '') ?? 0;
  const descuento = item ? descuentoDeItem(item) : 0;
  const id = (campo: string) => `item-${indice}-${campo}`;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="chip">Ítem {indice + 1}</span>
        {puedeQuitar ? (
          <button
            type="button"
            className="button-ghost px-2 py-1 text-rose-600"
            onClick={onQuitar}
            aria-label={`Quitar ítem ${indice + 1}`}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="sr-only" htmlFor={id('producto')}>
            Producto del ítem {indice + 1}
          </label>
          <input
            id={id('producto')}
            className="input"
            placeholder="Producto"
            {...register(`items.${indice}.nombre_producto`)}
          />
        </div>

        <div>
          <label className="sr-only" htmlFor={id('marca')}>
            Marca del ítem {indice + 1}
          </label>
          <input
            id={id('marca')}
            className="input"
            placeholder="Marca"
            {...register(`items.${indice}.marca`)}
          />
        </div>

        <div>
          <label className="sr-only" htmlFor={id('categoria')}>
            Categoría del ítem {indice + 1}
          </label>
          <select id={id('categoria')} className="input" {...register(`items.${indice}.categoria_id`)}>
            <option value="">Sin categoría</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.ruta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="sr-only" htmlFor={id('unidades')}>
            Unidades del ítem {indice + 1}
          </label>
          <input
            id={id('unidades')}
            className="input"
            inputMode="numeric"
            placeholder="Unidades"
            {...register(`items.${indice}.unidades`)}
          />
        </div>

        <div>
          <label className="sr-only" htmlFor={id('peso')}>
            Peso o volumen del ítem {indice + 1}
          </label>
          <input
            id={id('peso')}
            className="input"
            placeholder="Peso / volumen"
            {...register(`items.${indice}.peso_volumen`)}
          />
        </div>

        <div>
          <label className="sr-only" htmlFor={id('precio')}>
            Precio unitario del ítem {indice + 1}
          </label>
          <input
            id={id('precio')}
            className="input"
            inputMode="decimal"
            placeholder="Precio unitario"
            {...register(`items.${indice}.precio_unitario`)}
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="sr-only" htmlFor={id('dcto-tipo')}>
              Tipo de descuento del ítem {indice + 1}
            </label>
            <select
              id={id('dcto-tipo')}
              className="input"
              {...register(`items.${indice}.descuento_tipo`)}
            >
              <option value="ninguno">Sin dcto.</option>
              <option value="porcentaje">% dcto.</option>
              <option value="monto">$ dcto.</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="sr-only" htmlFor={id('dcto-valor')}>
              Valor del descuento del ítem {indice + 1}
            </label>
            <input
              id={id('dcto-valor')}
              className="input"
              inputMode="decimal"
              placeholder="Valor"
              disabled={item?.descuento_tipo === 'ninguno'}
              {...register(`items.${indice}.descuento_valor`)}
            />
          </div>
        </div>
      </div>

      {precio > 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          {descuento > 0 ? (
            <>
              {formatearCLP(precio)} − {formatearCLP(descuento)} (
              {porcentajeDescuento(precio, descuento)}%) ={' '}
              <strong className="text-slate-700">
                {formatearCLP(precioConDescuento(precio, descuento))}
              </strong>{' '}
              c/u ·{' '}
            </>
          ) : null}
          Total línea:{' '}
          <strong className="text-slate-700">{formatearCLP(item ? totalDeItem(item) : 0)}</strong>
        </p>
      ) : null}
    </div>
  );
}

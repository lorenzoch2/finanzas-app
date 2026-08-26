import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCategorias } from '@/datos/categorias';
import { useFuentes } from '@/datos/saldos';
import { useGuardarTransaccion } from '@/datos/transacciones';
import type { ItemFormulario } from '@/datos/transacciones';
import type { TransaccionConDetalle } from '@/lib/database.types';
import { useEstadoApp } from '@/lib/estadoApp';
import {
  formatearCLP,
  montoDesdePorcentaje,
  parsearMonto,
  porcentajeDescuento,
  precioConDescuento,
  totalLinea,
} from '@/lib/dinero';
import { entradaDateTimeAIso, paraInputDateTime } from '@/lib/fecha';

/**
 * Captura de una transacción, con detalle opcional de la boleta.
 *
 * Decisiones que vale la pena explicar:
 *
 * - Los campos numéricos se guardan como texto en el formulario y se
 *   interpretan con `parsearMonto`. Escribir "12.500" en Chile significa doce
 *   mil quinientos, y `Number("12.500")` daría 12,5.
 *
 * - El descuento se captura como porcentaje O como monto, pero se guarda
 *   siempre como monto: es la única fuente de verdad en la base, y el
 *   porcentaje se deriva. Así no vuelve a pasar que las mismas dos columnas
 *   signifiquen cosas distintas según quién escribió la fila.
 *
 * - Cuando el detalle suma menos que el total, la diferencia va a
 *   `monto_sin_detalle`, una columna de la transacción. Antes se inventaba un
 *   ítem llamado "Gasto sin detalle" y se guardaba como si fuera un producto,
 *   lo que ensuciaba cualquier análisis por categoría.
 */

const itemSchema = z.object({
  nombre_producto: z.string().trim(),
  marca: z.string().trim(),
  categoria_id: z.string(),
  unidades: z.string(),
  peso_volumen: z.string().trim(),
  precio_unitario: z.string(),
  descuento_tipo: z.enum(['ninguno', 'porcentaje', 'monto']),
  descuento_valor: z.string(),
  calificacion: z.string(),
});

const esquema = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.string().min(1, 'Indica el monto.'),
  fuente_id: z.string(),
  fecha: z.string().min(1, 'Indica la fecha.'),
  nota: z.string().trim(),
  detallado: z.boolean(),
  items: z.array(itemSchema),
});

type Valores = z.infer<typeof esquema>;
type ItemValores = z.infer<typeof itemSchema>;

const itemVacio = (): ItemValores => ({
  nombre_producto: '',
  marca: '',
  categoria_id: '',
  unidades: '1',
  peso_volumen: '',
  precio_unitario: '',
  descuento_tipo: 'ninguno',
  descuento_valor: '',
  calificacion: '',
});

/** Descuento por unidad en pesos, sea cual sea el modo en que se capturó. */
const descuentoDeItem = (item: ItemValores): number => {
  const precio = parsearMonto(item.precio_unitario) ?? 0;
  const valor = parsearMonto(item.descuento_valor) ?? 0;

  if (item.descuento_tipo === 'porcentaje') return montoDesdePorcentaje(precio, valor);
  if (item.descuento_tipo === 'monto') return Math.min(valor, precio);
  return 0;
};

const totalDeItem = (item: ItemValores): number =>
  totalLinea(parsearMonto(item.precio_unitario) ?? 0, descuentoDeItem(item), parsearMonto(item.unidades) ?? 1);

/** Un ítem cuenta si tiene algo escrito; los renglones en blanco se descartan. */
const tieneContenido = (item: ItemValores): boolean =>
  Boolean(item.nombre_producto || item.precio_unitario || item.descuento_valor);

interface Props {
  transaccion?: TransaccionConDetalle | null;
  onGuardado?: () => void;
  onCancelar?: () => void;
}

export default function FormularioTransaccion({ transaccion, onGuardado, onCancelar }: Props) {
  const { zona } = useEstadoApp();
  const { data: fuentes = [] } = useFuentes();
  const { opciones: categorias } = useCategorias();
  const guardar = useGuardarTransaccion();

  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const editando = Boolean(transaccion);

  const valoresIniciales = useMemo<Valores>(() => {
    if (!transaccion) {
      return {
        tipo: 'egreso',
        monto: '',
        fuente_id: '',
        fecha: paraInputDateTime(new Date(), zona),
        nota: '',
        detallado: false,
        items: [itemVacio()],
      };
    }

    const items = transaccion.items_detalle ?? [];

    return {
      tipo: transaccion.tipo,
      monto: String(transaccion.monto ?? ''),
      fuente_id: transaccion.fuente_id ?? '',
      fecha: paraInputDateTime(new Date(transaccion.fecha), zona),
      nota: transaccion.nota ?? '',
      detallado: items.length > 0,
      items: items.length
        ? items.map((item) => ({
            nombre_producto: item.nombre_producto ?? '',
            marca: item.marca ?? '',
            categoria_id: item.categoria_id ?? '',
            unidades: String(item.unidades ?? 1),
            peso_volumen: item.peso_volumen ?? '',
            precio_unitario: String(item.precio_unitario ?? ''),
            // Se muestra como monto porque es como se guarda.
            descuento_tipo: item.descuento_monto > 0 ? ('monto' as const) : ('ninguno' as const),
            descuento_valor: item.descuento_monto > 0 ? String(item.descuento_monto) : '',
            calificacion: item.calificacion != null ? String(item.calificacion) : '',
          }))
        : [itemVacio()],
    };
  }, [transaccion, zona]);

  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciales,
  });

  const { control, register, handleSubmit, watch, reset, setValue, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    reset(valoresIniciales);
  }, [valoresIniciales, reset]);

  const tipo = watch('tipo');
  const detallado = watch('detallado');
  const items = watch('items');
  const montoTexto = watch('monto');

  const puedeDetallar = tipo === 'egreso';
  const totalIngresado = parsearMonto(montoTexto) ?? 0;

  const itemsConContenido = useMemo(() => (items ?? []).filter(tieneContenido), [items]);
  const totalDetalle = useMemo(
    () => itemsConContenido.reduce((suma, item) => suma + totalDeItem(item), 0),
    [itemsConContenido],
  );

  const activo = puedeDetallar && detallado;
  const sobrante = activo ? Math.max(totalIngresado - totalDetalle, 0) : 0;
  const excedido = activo && totalDetalle - totalIngresado > 0.5;

  // Al activar el detalle con un total ya escrito, se propone ese total como
  // precio del primer ítem: es el caso de "una sola compra grande".
  useEffect(() => {
    if (!activo) return;
    const primero = items?.[0];
    if (totalIngresado > 0 && items?.length === 1 && primero && !primero.precio_unitario) {
      setValue('items.0.precio_unitario', String(totalIngresado), { shouldDirty: false });
    }
    // Solo debe correr al encender el detalle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const enviar = handleSubmit(async (valores) => {
    setError(null);
    setAviso(null);

    const fechaIso = entradaDateTimeAIso(valores.fecha, zona);
    if (!fechaIso) {
      setError('La fecha no es válida.');
      return;
    }

    const montoFinal = parsearMonto(valores.monto);
    if (montoFinal == null || montoFinal < 0) {
      setError('El monto debe ser un número mayor o igual a cero.');
      return;
    }

    const conContenido = valores.items.filter(tieneContenido);
    const detalleActivo = valores.tipo === 'egreso' && valores.detallado && conContenido.length > 0;
    const sumaDetalle = conContenido.reduce((suma, item) => suma + totalDeItem(item), 0);

    if (detalleActivo && sumaDetalle - montoFinal > 0.5) {
      setError(
        `El detalle suma ${formatearCLP(sumaDetalle)} y el total ingresado es ${formatearCLP(montoFinal)}. ` +
          'Corrige el total o revisa los ítems.',
      );
      return;
    }

    const itemsPayload: ItemFormulario[] = detalleActivo
      ? conContenido.map((item) => ({
          nombre_producto: item.nombre_producto,
          marca: item.marca,
          categoria_id: item.categoria_id,
          unidades: parsearMonto(item.unidades) ?? 1,
          peso_volumen: item.peso_volumen,
          precio_unitario: parsearMonto(item.precio_unitario),
          descuento_monto: descuentoDeItem(item),
          calificacion: parsearMonto(item.calificacion),
        }))
      : [];

    try {
      await guardar.mutateAsync({
        id: transaccion?.id ?? null,
        transaccion: {
          tipo: valores.tipo,
          monto: montoFinal,
          fecha: fechaIso,
          fuente_id: valores.fuente_id || null,
          nota: valores.nota,
          monto_sin_detalle: detalleActivo ? Math.max(montoFinal - sumaDetalle, 0) : 0,
        },
        items: itemsPayload,
      });

      if (!editando) {
        reset({ ...valoresIniciales, fecha: paraInputDateTime(new Date(), zona) });
        setAviso('Transacción guardada.');
      }
      onGuardado?.();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    }
  });

  return (
    <form onSubmit={(e) => void enviar(e)} className="card space-y-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">
          {editando ? 'Editar transacción' : 'Nueva transacción'}
        </h2>
        {onCancelar ? (
          <button type="button" className="button-ghost px-3" onClick={onCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>

      {/* Tipo: dos botones grandes, no un select. Es la primera decisión y la
          más frecuente. */}
      <div className="grid grid-cols-2 gap-2">
        {(['egreso', 'ingreso'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            onClick={() => setValue('tipo', valor)}
            className={`button py-3 ${
              tipo === valor
                ? valor === 'egreso'
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {valor === 'egreso' ? 'Gasto' : 'Ingreso'}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label" htmlFor="monto">
            Monto total
          </label>
          <input
            id="monto"
            inputMode="decimal"
            placeholder="12.500"
            className={`input ${formState.errors.monto ? 'input-error' : ''}`}
            {...register('monto')}
          />
          {totalIngresado > 0 ? (
            <p className="text-xs text-slate-500">{formatearCLP(totalIngresado)}</p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="fuente">
            Fuente
          </label>
          <select id="fuente" className="input" {...register('fuente_id')}>
            <option value="">Sin fuente</option>
            {fuentes.map((fuente) => (
              <option key={fuente.id} value={fuente.id}>
                {fuente.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="fecha">
            Fecha y hora
          </label>
          <input
            id="fecha"
            type="datetime-local"
            className={`input ${formState.errors.fecha ? 'input-error' : ''}`}
            {...register('fecha')}
          />
        </div>

        <div className="space-y-1.5">
          <label className="label" htmlFor="nota">
            Nota
          </label>
          <input id="nota" className="input" placeholder="Opcional" {...register('nota')} />
        </div>
      </div>

      {puedeDetallar ? (
        <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <input type="checkbox" className="size-4 accent-brand-600" {...register('detallado')} />
          <span className="text-sm font-medium text-slate-700">Detallar la boleta ítem por ítem</span>
        </label>
      ) : null}

      {activo ? (
        <div className="space-y-4">
          {fields.map((field, indice) => {
            const item = items?.[indice];
            const precio = parsearMonto(item?.precio_unitario ?? '') ?? 0;
            const descuento = item ? descuentoDeItem(item) : 0;

            return (
              <div key={field.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="chip">Ítem {indice + 1}</span>
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      className="button-ghost px-2 py-1 text-rose-600"
                      onClick={() => remove(indice)}
                      aria-label={`Quitar ítem ${indice + 1}`}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="input sm:col-span-2"
                    placeholder="Producto"
                    {...register(`items.${indice}.nombre_producto`)}
                  />
                  <input className="input" placeholder="Marca" {...register(`items.${indice}.marca`)} />
                  <select className="input" {...register(`items.${indice}.categoria_id`)}>
                    <option value="">Sin categoría</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.ruta}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input"
                    inputMode="numeric"
                    placeholder="Unidades"
                    {...register(`items.${indice}.unidades`)}
                  />
                  <input
                    className="input"
                    placeholder="Peso / volumen"
                    {...register(`items.${indice}.peso_volumen`)}
                  />

                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="Precio unitario"
                    {...register(`items.${indice}.precio_unitario`)}
                  />

                  <div className="flex gap-2">
                    <select className="input" {...register(`items.${indice}.descuento_tipo`)}>
                      <option value="ninguno">Sin dcto.</option>
                      <option value="porcentaje">% dcto.</option>
                      <option value="monto">$ dcto.</option>
                    </select>
                    <input
                      className="input"
                      inputMode="decimal"
                      placeholder="Valor"
                      disabled={item?.descuento_tipo === 'ninguno'}
                      {...register(`items.${indice}.descuento_valor`)}
                    />
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
                    <strong className="text-slate-700">
                      {formatearCLP(item ? totalDeItem(item) : 0)}
                    </strong>
                  </p>
                ) : null}
              </div>
            );
          })}

          <button type="button" className="button-secondary w-full" onClick={() => append(itemVacio())}>
            <Plus size={16} aria-hidden /> Agregar ítem
          </button>

          <div className="rounded-3xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Suma del detalle</span>
              <strong className="tabular-nums text-slate-900">{formatearCLP(totalDetalle)}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-600">Total ingresado</span>
              <strong className="tabular-nums text-slate-900">{formatearCLP(totalIngresado)}</strong>
            </div>

            {excedido ? (
              <p className="mt-3 text-rose-700">
                El detalle supera el total en {formatearCLP(totalDetalle - totalIngresado)}.{' '}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setValue('monto', String(Math.round(totalDetalle)))}
                >
                  Usar la suma del detalle
                </button>
              </p>
            ) : sobrante > 0.5 ? (
              <p className="mt-3 text-slate-600">
                Quedan {formatearCLP(sobrante)} sin detallar. Se guardarán en la transacción como
                gasto sin detalle, no como un producto inventado.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="mensaje-error">{error}</p> : null}
      {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

      <button type="submit" className="button-primary w-full" disabled={guardar.isPending}>
        {guardar.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {editando ? 'Guardar cambios' : 'Registrar'}
      </button>
    </form>
  );
}

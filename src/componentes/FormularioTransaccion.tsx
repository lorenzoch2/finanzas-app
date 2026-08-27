import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudOff, Loader2, Plus } from 'lucide-react';
import { useCategorias } from '@/datos/categorias';
import { useFuentes } from '@/datos/saldos';
import { useGuardarTransaccion } from '@/datos/transacciones';
import type { ItemFormulario } from '@/datos/transacciones';
import type { TransaccionConDetalle } from '@/lib/database.types';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { entradaDateTimeAIso, paraInputDateTime } from '@/lib/fecha';
import FilaItem from './FilaItem';
import ResumenDetalle from './ResumenDetalle';
import {
  descuentoDeItem,
  esquemaTransaccion,
  itemVacio,
  sumarDetalle,
  tieneContenido,
} from './esquemaTransaccion';
import type { ValoresTransaccion } from './esquemaTransaccion';

/**
 * Captura de una transacción, con detalle opcional de la boleta.
 *
 * El formulario en sí es "no controlado": el padre solo se suscribe a `tipo` y
 * `detallado`, que cambian cuando tocas un botón, no cuando escribes. Las
 * partes que sí necesitan reaccionar a cada tecla —cada fila y el cuadre de
 * totales— viven en componentes hijos con `useWatch`. Sin esa separación, una
 * boleta de veinte ítems redibujaba las veinte filas por cada carácter.
 */

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
  const [encolada, setEncolada] = useState(false);
  const editando = Boolean(transaccion);

  const valoresIniciales = useMemo<ValoresTransaccion>(() => {
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
            descuento_tipo: item.descuento_monto > 0 ? ('monto' as const) : ('ninguno' as const),
            descuento_valor: item.descuento_monto > 0 ? String(item.descuento_monto) : '',
            calificacion: item.calificacion != null ? String(item.calificacion) : '',
          }))
        : [itemVacio()],
    };
  }, [transaccion, zona]);

  const form = useForm<ValoresTransaccion>({
    resolver: zodResolver(esquemaTransaccion),
    defaultValues: valoresIniciales,
  });

  const { control, register, handleSubmit, watch, reset, setValue, getValues, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  useEffect(() => {
    reset(valoresIniciales);
  }, [valoresIniciales, reset]);

  // Solo estos dos: cambian al pulsar, no al escribir.
  const tipo = watch('tipo');
  const detallado = watch('detallado');

  const puedeDetallar = tipo === 'egreso';
  const activo = puedeDetallar && detallado;

  // Al encender el detalle con un total ya escrito, se propone ese total como
  // precio del primer ítem: es el caso de "una sola compra grande".
  // Se lee con getValues para no suscribir el formulario al campo `monto`.
  useEffect(() => {
    if (!activo) return;

    const valores = getValues();
    const total = parsearMonto(valores.monto) ?? 0;
    const primero = valores.items[0];

    if (total > 0 && valores.items.length === 1 && primero && !primero.precio_unitario) {
      setValue('items.0.precio_unitario', String(total), { shouldDirty: false });
    }
    // Solo debe correr al encender el detalle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const enviar = handleSubmit(async (valores) => {
    setError(null);
    setAviso(null);
    setEncolada(false);

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
    const sumaDetalle = detalleActivo ? sumarDetalle(valores.items) : 0;

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
      const resultado = await guardar.mutateAsync({
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
        setEncolada(resultado.encolada);
        setAviso(
          resultado.encolada
            ? 'Guardado en este dispositivo. Se subirá solo cuando vuelva la conexión.'
            : 'Transacción guardada.',
        );
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

      {/* Dos botones grandes en vez de un select: es la primera decisión y la
          más frecuente. */}
      <fieldset>
        <legend className="sr-only">Tipo de transacción</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['egreso', 'ingreso'] as const).map((valor) => (
            <button
              key={valor}
              type="button"
              aria-pressed={tipo === valor}
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
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label" htmlFor="monto">
            Monto total
          </label>
          <input
            id="monto"
            inputMode="decimal"
            placeholder="12.500"
            aria-invalid={formState.errors.monto ? true : undefined}
            className={`input ${formState.errors.monto ? 'input-error' : ''}`}
            {...register('monto')}
          />
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
            aria-invalid={formState.errors.fecha ? true : undefined}
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
          {fields.map((field, indice) => (
            <FilaItem
              key={field.id}
              control={control}
              register={register}
              indice={indice}
              categorias={categorias}
              puedeQuitar={fields.length > 1}
              onQuitar={() => remove(indice)}
            />
          ))}

          <button type="button" className="button-secondary w-full" onClick={() => append(itemVacio())}>
            <Plus size={16} aria-hidden /> Agregar ítem
          </button>

          <ResumenDetalle
            control={control}
            onUsarTotalDetalle={(total) => setValue('monto', String(total))}
          />
        </div>
      ) : null}

      {error ? <p className="mensaje-error">{error}</p> : null}
      {aviso ? (
        <p className={encolada ? 'mensaje-error border-amber-200 bg-amber-50 text-amber-800' : 'mensaje-ok'}>
          {encolada ? <CloudOff size={14} className="mr-1 inline" aria-hidden /> : null}
          {aviso}
        </p>
      ) : null}

      <button type="submit" className="button-primary w-full" disabled={guardar.isPending}>
        {guardar.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {editando ? 'Guardar cambios' : 'Registrar'}
      </button>
    </form>
  );
}

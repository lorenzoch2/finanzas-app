import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CloudOff, Loader2, Plus, Store } from 'lucide-react';
import { useEstablecimientos } from '@/datos/establecimientos';
import { useCrearProducto } from '@/datos/productos';
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
 * El formulario es «no controlado»: el padre solo se suscribe a `tipo` y
 * `detallado`, que cambian al pulsar un botón, no al escribir. Las partes que
 * sí reaccionan a cada tecla —cada fila y el cuadre de totales— viven en
 * componentes hijos con `useWatch`. Sin esa separación, una boleta de veinte
 * ítems redibujaba las veinte filas por cada carácter.
 */

interface Props {
  transaccion?: TransaccionConDetalle | null;
  onGuardado?: () => void;
  onCancelar?: () => void;
}

export default function FormularioTransaccion({ transaccion, onGuardado, onCancelar }: Props) {
  const { zona } = useEstadoApp();
  const { data: fuentes = [] } = useFuentes();
  const { data: establecimientos = [] } = useEstablecimientos();
  const guardar = useGuardarTransaccion();
  const crearProducto = useCrearProducto();

  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [encolada, setEncolada] = useState(false);
  const editando = Boolean(transaccion);

  const valoresIniciales = useMemo<ValoresTransaccion>(() => {
    if (!transaccion) {
      // La cuenta principal viene preseleccionada: es de donde sale la mayoría
      // de los gastos, y ahorra un toque en la pantalla que más se usa.
      const principal = fuentes.find((f) => f.es_principal);

      return {
        tipo: 'egreso',
        monto: '',
        fuente_id: principal?.id ?? '',
        establecimiento_id: '',
        fecha: paraInputDateTime(new Date(), zona),
        nota: '',
        detallado: false,
        items: [itemVacio()],
      };
    }

    const items = transaccion.items_detalle ?? [];

    return {
      tipo: transaccion.tipo === 'ingreso' ? 'ingreso' : 'egreso',
      monto: String(transaccion.monto ?? ''),
      fuente_id: transaccion.fuente_id ?? '',
      establecimiento_id: transaccion.establecimiento_id ?? '',
      fecha: paraInputDateTime(new Date(transaccion.fecha), zona),
      nota: transaccion.nota ?? '',
      detallado: items.length > 0,
      items: items.length
        ? items.map((item) => ({
            producto_id: item.producto_id ?? '',
            nombre_producto: item.productos?.nombre ?? item.nombre_producto ?? '',
            marca: item.productos?.marca ?? item.marca ?? '',
            categoria_id: item.categoria_id ?? '',
            unidades: String(item.unidades ?? 1),
            cantidad_medida: item.cantidad_medida != null ? String(item.cantidad_medida) : '',
            vendido_por: item.cantidad_medida != null ? ('peso' as const) : ('unidad' as const),
            precio_unitario: String(item.precio_unitario ?? ''),
            descuento_tipo: item.descuento_monto > 0 ? ('monto' as const) : ('ninguno' as const),
            descuento_valor: item.descuento_monto > 0 ? String(item.descuento_monto) : '',
            calificacion: item.calificacion != null ? String(item.calificacion) : '',
          }))
        : [itemVacio()],
    };
  }, [transaccion, zona, fuentes]);

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
  // precio del primer ítem: es el caso de «una sola compra grande».
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

    try {
      const itemsPayload: ItemFormulario[] = [];

      if (detalleActivo) {
        for (const item of conContenido) {
          // Un producto escrito a mano se añade al catálogo al guardar. Si ya
          // existía, la base lo resuelve por su unicidad y se reutiliza, con
          // lo que no se puede crear un duplicado ni queriendo.
          let productoId = item.producto_id || null;

          if (!productoId && item.nombre_producto.trim()) {
            const creado = await crearProducto.mutateAsync({
              nombre: item.nombre_producto,
              marca: item.marca || null,
              categoria_id: item.categoria_id || null,
              vendido_por: item.vendido_por,
            });
            productoId = creado.id;
          }

          itemsPayload.push({
            producto_id: productoId,
            nombre_producto: item.nombre_producto,
            marca: item.marca,
            categoria_id: item.categoria_id,
            unidades: parsearMonto(item.unidades) ?? 1,
            cantidad_medida:
              item.vendido_por === 'peso' ? (parsearMonto(item.cantidad_medida) ?? null) : null,
            precio_unitario: parsearMonto(item.precio_unitario),
            descuento_monto: descuentoDeItem(item),
            calificacion: parsearMonto(item.calificacion),
          });
        }
      }

      const resultado = await guardar.mutateAsync({
        id: transaccion?.id ?? null,
        transaccion: {
          tipo: valores.tipo,
          monto: montoFinal,
          fecha: fechaIso,
          fuente_id: valores.fuente_id || null,
          fuente_destino_id: null,
          establecimiento_id: valores.establecimiento_id || null,
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

  const guardando = guardar.isPending || crearProducto.isPending;

  return (
    <form onSubmit={(e) => void enviar(e)} className="card space-y-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-tinta">
          {editando ? 'Editar transacción' : 'Nueva transacción'}
        </h2>
        {onCancelar ? (
          <button type="button" className="button-ghost px-3" onClick={onCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>

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
                    ? 'bg-sale text-white'
                    : 'bg-entra text-white'
                  : 'border border-borde bg-tarjeta text-tinta-2'
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
            Cuenta
          </label>
          <select id="fuente" className="input" {...register('fuente_id')}>
            <option value="">Sin cuenta</option>
            {fuentes.map((fuente) => (
              <option key={fuente.id} value={fuente.id}>
                {fuente.nombre}
                {fuente.es_principal ? ' (principal)' : ''}
              </option>
            ))}
          </select>
        </div>

        {puedeDetallar ? (
          <div className="space-y-1.5">
            <label className="label" htmlFor="establecimiento">
              <Store size={14} className="mr-1 inline text-tinta-3" aria-hidden />
              Dónde
            </label>
            <select id="establecimiento" className="input" {...register('establecimiento_id')}>
              <option value="">Sin especificar</option>
              {establecimientos.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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

        <div className="space-y-1.5 sm:col-span-2">
          <label className="label" htmlFor="nota">
            Nota
          </label>
          <input id="nota" className="input" placeholder="Opcional" {...register('nota')} />
        </div>
      </div>

      {puedeDetallar ? (
        <label className="flex items-center gap-3 rounded-campo bg-elevado px-4 py-3">
          <input type="checkbox" className="size-4 accent-brand-600" {...register('detallado')} />
          <span className="text-sm font-medium text-tinta-2">Detallar la boleta ítem por ítem</span>
        </label>
      ) : null}

      {activo ? (
        <div className="space-y-4">
          {fields.map((field, indice) => (
            <FilaItem
              key={field.id}
              control={control}
              register={register}
              setValue={setValue}
              indice={indice}
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
        <p className={encolada ? 'mensaje-error border-alerta/30 bg-alerta-suave text-alerta' : 'mensaje-ok'}>
          {encolada ? <CloudOff size={14} className="mr-1 inline" aria-hidden /> : null}
          {aviso}
        </p>
      ) : null}

      <button type="submit" className="button-primary w-full" disabled={guardando}>
        {guardando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {editando ? 'Guardar cambios' : 'Registrar'}
      </button>
    </form>
  );
}

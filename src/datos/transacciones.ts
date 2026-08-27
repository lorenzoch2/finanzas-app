import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { rangoDelMes } from '@/lib/fecha';
import { encolar, esFalloDeRed, leerCola, quitarDeCola } from '@/lib/colaOffline';
import type { Json, TipoTransaccion, TransaccionConDetalle } from '@/lib/database.types';

/**
 * Transacciones y su detalle.
 *
 * Crear, editar y borrar pasan por funciones de la base, así que son
 * atómicas: antes eran varios requests encadenados sin transacción, y si
 * fallaba el segundo quedaba una boleta sin detalle.
 */

export interface ItemFormulario {
  /** Del catálogo. Null solo si el producto todavía no se ha creado. */
  producto_id: string | null;
  nombre_producto: string;
  marca: string;
  categoria_id: string;
  unidades: number;
  /** Peso real de esta compra. Solo para productos vendidos a granel. */
  cantidad_medida: number | null;
  precio_unitario: number | null;
  descuento_monto: number;
  calificacion: number | null;
}

export interface TransaccionFormulario {
  tipo: TipoTransaccion;
  monto: number;
  fecha: string; // ISO UTC
  fuente_id: string | null;
  /** Solo en transferencias: la cuenta que recibe. */
  fuente_destino_id: string | null;
  establecimiento_id: string | null;
  nota: string;
  monto_sin_detalle: number;
}

const SELECT_COMPLETO =
  '*, items_detalle(*, productos(id, nombre, marca)), fuentes_cuentas!fk_transacciones_fuente(id, nombre, tipo), establecimientos(id, nombre, tipo)';

export function useTransaccionesDelMes(mes: string, zona: string) {
  return useQuery({
    queryKey: [...claves.transacciones(mes), zona],
    queryFn: async (): Promise<TransaccionConDetalle[]> => {
      const rango = rangoDelMes(mes, zona);
      if (!rango) return [];

      const { data, error } = await supabase
        .from('transacciones')
        .select(SELECT_COMPLETO)
        .gte('fecha', rango.inicio)
        .lt('fecha', rango.fin)
        .order('fecha', { ascending: false });

      if (error) throw new Error(mensajeDeError(error));
      return (data ?? []) as unknown as TransaccionConDetalle[];
    },
  });
}

export function useTransaccion(id: string | null) {
  return useQuery({
    queryKey: claves.transaccion(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<TransaccionConDetalle | null> => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('transacciones')
        .select(SELECT_COMPLETO)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(mensajeDeError(error));
      return (data ?? null) as unknown as TransaccionConDetalle | null;
    },
  });
}

/** Invalida todo lo que un cambio en transacciones puede haber movido. */
const invalidarTodo = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ['transacciones'] });
  void qc.invalidateQueries({ queryKey: ['saldos'] });
  void qc.invalidateQueries({ queryKey: ['resumen'] });
  void qc.invalidateQueries({ queryKey: ['presupuesto'] });
};

export interface ResultadoGuardado {
  id: string | null;
  encolada: boolean;
}

const enviarTransaccion = async (
  transaccion: TransaccionFormulario,
  items: ItemFormulario[],
  id: string | null,
): Promise<string> => {
  const { data, error } = await supabase.rpc('guardar_transaccion', {
    p_transaccion: transaccion as unknown as Json,
    p_items: items as unknown as Json,
    p_id: id,
  });

  if (error) throw new Error(mensajeDeError(error));
  return data as string;
};

export function useGuardarTransaccion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      transaccion,
      items,
    }: {
      id?: string | null;
      transaccion: TransaccionFormulario;
      items: ItemFormulario[];
    }): Promise<ResultadoGuardado> => {
      try {
        const nuevoId = await enviarTransaccion(transaccion, items, id ?? null);
        return { id: nuevoId, encolada: false };
      } catch (error) {
        // Solo se encolan transacciones NUEVAS y solo ante fallos de red.
        // Una edición encolada obligaría a resolver conflictos, y un rechazo
        // del servidor fallaría igual en cada reintento.
        if (!id && esFalloDeRed(error)) {
          encolar(transaccion, items);
          return { id: null, encolada: true };
        }
        throw error;
      }
    },
    onSuccess: (resultado, variables) => {
      invalidarTodo(qc);
      if (resultado.encolada) void qc.invalidateQueries({ queryKey: claves.cola });
      if (variables.id) {
        void qc.invalidateQueries({ queryKey: claves.transaccion(variables.id) });
      }
    },
  });
}

/**
 * Vacía la cola pendiente contra el servidor.
 *
 * Se detiene al primer fallo de red en vez de seguir intentando el resto: si
 * la conexión se cayó, los siguientes van a fallar igual. Un rechazo del
 * servidor sí saca la operación de la cola, porque reintentarla eternamente
 * no la va a arreglar.
 */
export function useSincronizarCola() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ enviadas: number; descartadas: number; pendientes: number }> => {
      let enviadas = 0;
      let descartadas = 0;

      for (const operacion of leerCola()) {
        try {
          await enviarTransaccion(operacion.transaccion, operacion.items, null);
          quitarDeCola(operacion.id);
          enviadas += 1;
        } catch (error) {
          if (esFalloDeRed(error)) break;
          quitarDeCola(operacion.id);
          descartadas += 1;
        }
      }

      return { enviadas, descartadas, pendientes: leerCola().length };
    },
    onSuccess: () => {
      invalidarTodo(qc);
      void qc.invalidateQueries({ queryKey: claves.cola });
    },
  });
}

export function useBorrarTransaccion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('borrar_transaccion', { p_id: id });
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

/**
 * Traspaso entre cuentas propias.
 *
 * Es UNA fila con origen y destino, no dos movimientos que puedan quedar
 * descuadrados. No lleva detalle de ítems: mover dinero no es comprar nada.
 */
export function useTransferir() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      origenId,
      destinoId,
      monto,
      fecha,
      nota,
    }: {
      origenId: string;
      destinoId: string;
      monto: number;
      fecha: string;
      nota: string;
    }) => {
      if (!origenId || !destinoId) throw new Error('Elige la cuenta de origen y la de destino.');
      if (origenId === destinoId) throw new Error('El origen y el destino no pueden ser la misma cuenta.');
      if (monto <= 0) throw new Error('El monto debe ser mayor que cero.');

      return enviarTransaccion(
        {
          tipo: 'transferencia',
          monto,
          fecha,
          fuente_id: origenId,
          fuente_destino_id: destinoId,
          establecimiento_id: null,
          nota,
          monto_sin_detalle: 0,
        },
        [],
        null,
      );
    },
    onSuccess: () => invalidarTodo(qc),
  });
}

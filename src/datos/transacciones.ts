import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { rangoDelMes } from '@/lib/fecha';
import type { Json, TipoTransaccion, TransaccionConDetalle } from '@/lib/database.types';

/**
 * Transacciones y su detalle.
 *
 * Diferencias con la versión anterior:
 *
 * - Se consulta por mes, no `limit(200)` sobre todo el historial. Antes, la
 *   lista de movimientos y el cálculo de saldos bajaban conjuntos distintos de
 *   las mismas filas.
 * - Crear, editar y borrar pasan por funciones de la base, así que son
 *   atómicas. Antes eran varios requests encadenados sin transacción.
 */

export interface ItemFormulario {
  nombre_producto: string;
  marca: string;
  categoria_id: string;
  unidades: number;
  peso_volumen: string;
  precio_unitario: number | null;
  descuento_monto: number;
  calificacion: number | null;
}

export interface TransaccionFormulario {
  tipo: TipoTransaccion;
  monto: number;
  fecha: string; // ISO UTC
  fuente_id: string | null;
  nota: string;
  monto_sin_detalle: number;
}

export function useTransaccionesDelMes(mes: string, zona: string) {
  return useQuery({
    queryKey: [...claves.transacciones(mes), zona],
    queryFn: async (): Promise<TransaccionConDetalle[]> => {
      const rango = rangoDelMes(mes, zona);
      if (!rango) return [];

      const { data, error } = await supabase
        .from('transacciones')
        .select('*, items_detalle(*), fuentes_cuentas(id, nombre, tipo)')
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
        .select('*, items_detalle(*), fuentes_cuentas(id, nombre, tipo)')
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
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('guardar_transaccion', {
        p_transaccion: transaccion as unknown as Json,
        p_items: items as unknown as Json,
        p_id: id ?? null,
      });

      if (error) throw new Error(mensajeDeError(error));
      return data as string;
    },
    onSuccess: (_id, variables) => {
      invalidarTodo(qc);
      if (variables.id) {
        void qc.invalidateQueries({ queryKey: claves.transaccion(variables.id) });
      }
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

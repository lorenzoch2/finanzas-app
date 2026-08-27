import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { primerDiaDelMes } from '@/lib/fecha';
import type { Fuente, NuevaFuente, ResumenMensual, SaldoPorFuente } from '@/lib/database.types';

/**
 * Saldos y fuentes.
 *
 * El cambio de fondo respecto a la versión anterior: el cálculo ya no ocurre
 * en el navegador. `useFuentes` bajaba TODAS las transacciones sin filtro ni
 * límite y recorría el arreglo completo en cada render del Dashboard. Ahora es
 * una llamada a `saldos_por_fuente(mes, zona)` que devuelve una fila por
 * fuente, y la regla de negocio vive en un solo lugar: la base.
 */

export function useSaldos(mes: string, zona: string) {
  return useQuery({
    queryKey: [...claves.saldos(mes), zona],
    queryFn: async (): Promise<SaldoPorFuente[]> => {
      const { data, error } = await supabase.rpc('saldos_por_fuente', {
        p_mes: primerDiaDelMes(mes),
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useResumen(mes: string, zona: string) {
  return useQuery({
    queryKey: [...claves.resumen(mes), zona],
    queryFn: async (): Promise<ResumenMensual> => {
      const { data, error } = await supabase.rpc('resumen_mensual', {
        p_mes: primerDiaDelMes(mes),
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data?.[0] ?? { ingresos: 0, gastos: 0 };
    },
  });
}

/** Fuentes sin saldo, para los selectores de los formularios. */
export function useFuentes() {
  return useQuery({
    queryKey: claves.fuentes,
    queryFn: async (): Promise<Fuente[]> => {
      const { data, error } = await supabase
        .from('fuentes_cuentas')
        .select('*')
        .order('nombre', { ascending: true });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useCrearFuente() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (fuente: NuevaFuente) => {
      const nombre = fuente.nombre.trim();
      if (!nombre) throw new Error('El nombre de la fuente es obligatorio.');

      const { data, error } = await supabase
        .from('fuentes_cuentas')
        .insert({ ...fuente, nombre, tipo: fuente.tipo || 'cuenta' })
        .select()
        .single();

      if (error) throw new Error(mensajeDeError(error));
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.fuentes });
      void qc.invalidateQueries({ queryKey: ['saldos'] });
    },
  });
}

export function useRenombrarFuente() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, nombre, tipo }: { id: string; nombre: string; tipo?: string }) => {
      const limpio = nombre.trim();
      if (!limpio) throw new Error('El nombre de la fuente es obligatorio.');

      const { error } = await supabase
        .from('fuentes_cuentas')
        .update(tipo ? { nombre: limpio, tipo } : { nombre: limpio })
        .eq('id', id);

      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.fuentes });
      void qc.invalidateQueries({ queryKey: ['saldos'] });
    },
  });
}

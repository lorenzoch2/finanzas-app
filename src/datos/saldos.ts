import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
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

/** Saldo a la fecha de cierre del período que se está mirando. */
export function useSaldos(hasta: string, zona: string) {
  return useQuery({
    queryKey: [...claves.saldos(hasta), zona],
    queryFn: async (): Promise<SaldoPorFuente[]> => {
      const { data, error } = await supabase.rpc('saldos_por_fuente', {
        p_hasta: hasta,
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useResumen(desde: string, hasta: string, zona: string) {
  return useQuery({
    queryKey: [...claves.resumen(`${desde}_${hasta}`), zona],
    queryFn: async (): Promise<ResumenMensual> => {
      const { data, error } = await supabase.rpc('resumen_periodo', {
        p_desde: desde,
        p_hasta: hasta,
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

/**
 * Marca una cuenta como principal.
 *
 * Se desmarcan las demás primero porque la base tiene un índice único parcial
 * que solo admite una principal por usuario: intentar marcar la segunda sin
 * soltar la primera fallaría. Esa restricción vive en la base y no en la
 * interfaz a propósito, para que no dependa de que el cliente se acuerde.
 */
export function useMarcarPrincipal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error: errorLimpiar } = await supabase
        .from('fuentes_cuentas')
        .update({ es_principal: false })
        .eq('es_principal', true);

      if (errorLimpiar) throw new Error(mensajeDeError(errorLimpiar));

      const { error } = await supabase
        .from('fuentes_cuentas')
        .update({ es_principal: true })
        .eq('id', id);

      if (error) throw new Error(mensajeDeError(error));
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

import { useQuery } from '@tanstack/react-query';
import { faltaMigracion, mensajeDeError, supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

/**
 * Consultas de la vista de análisis.
 *
 * Todas las agregaciones ocurren en la base. La alternativa —bajar doce meses
 * de transacciones con su detalle y agrupar en el navegador— es exactamente el
 * error que tenía la versión original con los saldos, y en un teléfono con
 * datos móviles se nota mucho antes.
 */

type Fn = Database['public']['Functions'];

export { faltaMigracion };

export type GastoCategoria = Fn['gasto_por_categoria']['Returns'][number];
export type PuntoEvolucion = Fn['evolucion_mensual']['Returns'][number];
export type GastoEstablecimiento = Fn['gasto_por_establecimiento']['Returns'][number];
export type CompraProducto = Fn['historial_producto']['Returns'][number];
export type ProductoRanking = Fn['ranking_productos']['Returns'][number];
export type AhorroEstablecimiento = Fn['ahorro_descuentos']['Returns'][number];

export function useGastoPorCategoria(desde: string, hasta: string, zona: string) {
  return useQuery({
    queryKey: ['analisis', 'categorias', desde, hasta, zona],
    queryFn: async (): Promise<GastoCategoria[]> => {
      const { data, error } = await supabase.rpc('gasto_por_categoria', {
        p_desde: desde,
        p_hasta: hasta,
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useEvolucion(desde: string, hasta: string, zona: string) {
  return useQuery({
    queryKey: ['analisis', 'evolucion', desde, hasta, zona],
    queryFn: async (): Promise<PuntoEvolucion[]> => {
      const { data, error } = await supabase.rpc('evolucion_mensual', {
        p_desde: desde,
        p_hasta: hasta,
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      // La base devuelve la fecha completa; para mostrar basta el mes.
      return (data ?? []).map((p) => ({ ...p, mes: String(p.mes).slice(0, 7) }));
    },
  });
}

export function useGastoPorEstablecimiento(desde: string, hasta: string, zona: string) {
  return useQuery({
    queryKey: ['analisis', 'establecimientos', desde, hasta, zona],
    queryFn: async (): Promise<GastoEstablecimiento[]> => {
      const { data, error } = await supabase.rpc('gasto_por_establecimiento', {
        p_desde: desde,
        p_hasta: hasta,
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useRankingProductos(desde: string, hasta: string, zona: string, limite = 12) {
  return useQuery({
    queryKey: ['analisis', 'ranking', desde, hasta, zona, limite],
    queryFn: async (): Promise<ProductoRanking[]> => {
      const { data, error } = await supabase.rpc('ranking_productos', {
        p_desde: desde,
        p_hasta: hasta,
        p_tz: zona,
        p_limite: limite,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useAhorroDescuentos(desde: string, hasta: string, zona: string) {
  return useQuery({
    queryKey: ['analisis', 'ahorro', desde, hasta, zona],
    queryFn: async (): Promise<AhorroEstablecimiento[]> => {
      const { data, error } = await supabase.rpc('ahorro_descuentos', {
        p_desde: desde,
        p_hasta: hasta,
        p_tz: zona,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

/** Historial de precios de un producto: dónde y a cuánto se compró cada vez. */
export function useHistorialProducto(productoId: string | null) {
  return useQuery({
    queryKey: ['analisis', 'producto', productoId ?? ''],
    enabled: Boolean(productoId),
    queryFn: async (): Promise<CompraProducto[]> => {
      if (!productoId) return [];
      const { data, error } = await supabase.rpc('historial_producto', {
        p_producto_id: productoId,
      });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

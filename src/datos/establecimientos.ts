import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import type { Establecimiento, NuevoEstablecimiento, TipoEstablecimiento } from '@/lib/database.types';

/**
 * Establecimientos: dónde se hizo la compra.
 *
 * Va en la transacción y no en cada ítem porque una boleta es de un solo
 * local. Pedirlo producto por producto sería repetir veinte veces el mismo
 * dato estando de pie en la caja.
 */

export const TIPOS_ESTABLECIMIENTO: { valor: TipoEstablecimiento; etiqueta: string }[] = [
  { valor: 'supermercado', etiqueta: 'Supermercado' },
  { valor: 'feria', etiqueta: 'Feria' },
  { valor: 'almacen', etiqueta: 'Almacén' },
  { valor: 'farmacia', etiqueta: 'Farmacia' },
  { valor: 'restaurante', etiqueta: 'Restaurante' },
  { valor: 'online', etiqueta: 'En línea' },
  { valor: 'servicio', etiqueta: 'Servicio' },
  { valor: 'otro', etiqueta: 'Otro' },
];

export const etiquetaTipo = (tipo: TipoEstablecimiento): string =>
  TIPOS_ESTABLECIMIENTO.find((t) => t.valor === tipo)?.etiqueta ?? tipo;

export function useEstablecimientos() {
  return useQuery({
    queryKey: claves.establecimientos,
    queryFn: async (): Promise<Establecimiento[]> => {
      const { data, error } = await supabase
        .from('establecimientos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });
}

export function useCrearEstablecimiento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (establecimiento: NuevoEstablecimiento): Promise<Establecimiento> => {
      const nombre = establecimiento.nombre.trim();
      if (!nombre) throw new Error('El establecimiento necesita un nombre.');

      const { data, error } = await supabase
        .from('establecimientos')
        .insert({ ...establecimiento, nombre })
        .select()
        .single();

      if (error) {
        // Igual que en productos: si ya existe, se reutiliza en vez de cortar
        // la captura por un nombre repetido.
        if (typeof error === 'object' && 'code' in error && error.code === '23505') {
          const { data: existente } = await supabase
            .from('establecimientos')
            .select('*')
            .ilike('nombre', nombre)
            .limit(1);
          if (existente?.[0]) return existente[0];
        }
        throw new Error(mensajeDeError(error));
      }

      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: claves.establecimientos }),
  });
}

export function useEditarEstablecimiento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: { nombre?: string; tipo?: TipoEstablecimiento };
    }) => {
      const { error } = await supabase.from('establecimientos').update(cambios).eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.establecimientos });
      void qc.invalidateQueries({ queryKey: ['transacciones'] });
    },
  });
}

export function useBorrarEstablecimiento() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Las transacciones que lo usaban quedan sin establecimiento, no se
      // borran: la FK es ON DELETE SET NULL.
      const { error } = await supabase.from('establecimientos').delete().eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.establecimientos });
      void qc.invalidateQueries({ queryKey: ['transacciones'] });
    },
  });
}

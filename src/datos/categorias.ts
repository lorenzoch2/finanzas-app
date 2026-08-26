import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import type { Categoria } from '@/lib/database.types';

/**
 * Categorías.
 *
 * El esquema soporta jerarquía vía `parent_id`, pero hoy las 17 categorías
 * existentes son todas planas: ninguna tiene padre. Por eso el árbol se
 * construye solo para mostrar, y el borrado ya no necesita las ~80 líneas que
 * recorrían el subárbol ordenándolo por profundidad para borrarlo de a una:
 * el ON DELETE CASCADE de la migración 0003 lo hace en una sola operación, y
 * el trigger anti-ciclos impide que el árbol se corrompa.
 */

export interface CategoriaConRuta extends Categoria {
  ruta: string;
  profundidad: number;
}

export function useCategorias() {
  const consulta = useQuery({
    queryKey: claves.categorias,
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from('categorias')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
    staleTime: 15 * 60 * 1000,
  });

  const categorias = useMemo(() => consulta.data ?? [], [consulta.data]);

  /** Lista plana con la ruta completa, para los selectores. */
  const opciones = useMemo<CategoriaConRuta[]>(() => {
    const porPadre = new Map<string | null, Categoria[]>();
    for (const categoria of categorias) {
      const lista = porPadre.get(categoria.parent_id) ?? [];
      lista.push(categoria);
      porPadre.set(categoria.parent_id, lista);
    }

    const resultado: CategoriaConRuta[] = [];

    const recorrer = (padre: string | null, prefijo: string[], profundidad: number) => {
      // La profundidad se acota por si algún dato antiguo tuviera un ciclo:
      // el trigger lo impide de aquí en adelante, no hacia atrás.
      if (profundidad > 16) return;

      for (const categoria of porPadre.get(padre) ?? []) {
        const ruta = [...prefijo, categoria.nombre];
        resultado.push({ ...categoria, ruta: ruta.join(' › '), profundidad });
        recorrer(categoria.id, ruta, profundidad + 1);
      }
    };

    recorrer(null, [], 0);
    return resultado;
  }, [categorias]);

  return { ...consulta, categorias, opciones };
}

export function useCrearCategoria() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ nombre, parent_id }: { nombre: string; parent_id?: string | null }) => {
      const limpio = nombre.trim();
      if (!limpio) throw new Error('El nombre de la categoría es obligatorio.');

      const { error } = await supabase
        .from('categorias')
        .insert({ nombre: limpio, parent_id: parent_id || null });

      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: claves.categorias }),
  });
}

export function useEditarCategoria() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      nombre,
      parent_id,
    }: {
      id: string;
      nombre: string;
      parent_id?: string | null;
    }) => {
      const limpio = nombre.trim();
      if (!limpio) throw new Error('El nombre de la categoría es obligatorio.');
      if (parent_id === id) throw new Error('Una categoría no puede ser su propio padre.');

      const { error } = await supabase
        .from('categorias')
        .update({ nombre: limpio, parent_id: parent_id || null })
        .eq('id', id);

      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: claves.categorias }),
  });
}

export function useBorrarCategoria() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Las subcategorías caen por cascada y los ítems que la usaban quedan
      // con categoria_id nulo, no se borran.
      const { error } = await supabase.from('categorias').delete().eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.categorias });
      void qc.invalidateQueries({ queryKey: ['transacciones'] });
    },
  });
}

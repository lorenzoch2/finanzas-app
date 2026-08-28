import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import type { AvancePresupuesto, Presupuesto } from '@/lib/database.types';

/**
 * Límites de gasto por período.
 *
 * Se guardan como monto fijo, no como porcentaje de los ingresos: si
 * dependieran de lo que entra, un traspaso entre cuentas propias o un ingreso
 * atípico los subirían solos, y la referencia se perdería justo el mes en que
 * más falta hace. Las transferencias además no cuentan como gasto, así que
 * mover plata entre cuentas no mueve el avance.
 *
 * Pueden solaparse a propósito: un tope mensual general y otro acotado para un
 * viaje son dos límites reales que conviven.
 */

export type PresupuestoConFuentes = Presupuesto & {
  presupuesto_fuentes: { fuente_id: string }[];
};

/** Todos los presupuestos activos en una fecha, con su avance. */
export function useAvancePresupuestos(referencia: string, zona: string) {
  return useQuery({
    queryKey: [...claves.presupuesto(referencia), zona],
    queryFn: async (): Promise<AvancePresupuesto[]> => {
      const { data, error } = await supabase.rpc('avance_presupuestos', {
        p_referencia: referencia,
        p_tz: zona,
      });

      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

/** Todos los presupuestos, para gestionarlos. */
export function usePresupuestos() {
  return useQuery({
    queryKey: claves.presupuestos,
    queryFn: async (): Promise<PresupuestoConFuentes[]> => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*, presupuesto_fuentes(fuente_id)')
        .order('fecha_inicio', { ascending: false });

      if (error) throw new Error(mensajeDeError(error));
      return (data ?? []) as unknown as PresupuestoConFuentes[];
    },
  });
}

export interface DatosPresupuesto {
  id?: string;
  nombre: string;
  monto: number;
  fechaInicio: string;
  fechaFin: string;
  categoriaId: string | null;
  /** Vacío significa «todas las cuentas», que es el caso habitual. */
  fuentes: string[];
}

export function useGuardarPresupuesto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (datos: DatosPresupuesto) => {
      const nombre = datos.nombre.trim();
      if (!nombre) throw new Error('Ponle un nombre al presupuesto.');
      if (datos.monto <= 0) throw new Error('El límite debe ser mayor que cero.');
      if (datos.fechaFin < datos.fechaInicio) {
        throw new Error('La fecha de fin no puede ser anterior a la de inicio.');
      }

      const fila = {
        nombre,
        monto: datos.monto,
        fecha_inicio: datos.fechaInicio,
        fecha_fin: datos.fechaFin,
        categoria_id: datos.categoriaId,
      };

      let id = datos.id;

      if (id) {
        const { error } = await supabase.from('presupuestos').update(fila).eq('id', id);
        if (error) throw new Error(mensajeDeError(error));
      } else {
        const { data, error } = await supabase.from('presupuestos').insert(fila).select('id').single();
        if (error) throw new Error(mensajeDeError(error));
        id = data.id;
      }

      // Las fuentes se reemplazan enteras en vez de reconciliarse: son como
      // mucho un puñado de filas sin identidad propia, y rehacerlas es más
      // simple y más difícil de dejar a medias.
      const { error: errorBorrar } = await supabase
        .from('presupuesto_fuentes')
        .delete()
        .eq('presupuesto_id', id);
      if (errorBorrar) throw new Error(mensajeDeError(errorBorrar));

      if (datos.fuentes.length > 0) {
        const { error } = await supabase
          .from('presupuesto_fuentes')
          .insert(datos.fuentes.map((fuente_id) => ({ presupuesto_id: id as string, fuente_id })));
        if (error) throw new Error(mensajeDeError(error));
      }

      return id;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.presupuestos });
      void qc.invalidateQueries({ queryKey: ['presupuesto'] });
    },
  });
}

export function useBorrarPresupuesto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Las fuentes asociadas caen por cascada.
      const { error } = await supabase.from('presupuestos').delete().eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.presupuestos });
      void qc.invalidateQueries({ queryKey: ['presupuesto'] });
    },
  });
}

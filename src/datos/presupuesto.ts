import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { primerDiaDelMes } from '@/lib/fecha';
import type { AvancePresupuesto, Presupuesto } from '@/lib/database.types';

/**
 * Límite de gasto mensual.
 *
 * Se guarda como un monto fijo, no como un porcentaje de los ingresos. Es la
 * diferencia que importa: si dependiera de lo que entra, un traspaso entre
 * cuentas propias o un ingreso atípico lo subirían solo, y la referencia se
 * perdería justo el mes en que más falta hace.
 *
 * Las transferencias no cuentan como gasto, así que mover plata entre tus
 * cuentas no mueve el avance.
 */

export function useAvancePresupuesto(mes: string, zona: string) {
  return useQuery({
    queryKey: [...claves.presupuesto(mes), zona],
    queryFn: async (): Promise<AvancePresupuesto> => {
      const { data, error } = await supabase.rpc('avance_presupuesto', {
        p_mes: primerDiaDelMes(mes),
        p_tz: zona,
      });

      if (error) throw new Error(mensajeDeError(error));

      return (
        data?.[0] ?? {
          limite: 0,
          gastado: 0,
          dias_transcurridos: 0,
          dias_del_mes: 30,
          proyeccion: 0,
          es_mes_en_curso: false,
        }
      );
    },
  });
}

/** El límite global vigente, para poder editarlo. */
export function usePresupuestos() {
  return useQuery({
    queryKey: claves.presupuestos,
    queryFn: async (): Promise<Presupuesto[]> => {
      const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .order('vigente_desde', { ascending: false });

      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useFijarPresupuesto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      monto,
      mes,
      categoriaId = null,
    }: {
      monto: number;
      mes: string;
      categoriaId?: string | null;
    }) => {
      if (monto < 0) throw new Error('El límite no puede ser negativo.');

      const vigenteDesde = primerDiaDelMes(mes);

      // Cambiar el límite de este mes no debe reescribir el que regía antes:
      // el histórico se conserva para que las comparaciones pasadas sigan
      // siendo honestas. Por eso se busca la fila de ESTA fecha, no la última.
      //
      // El límite global y el de una categoría son filas distintas, así que la
      // condición cambia: `is null` para el global, `eq` para el de categoría.
      const base = supabase.from('presupuestos').select('id').eq('vigente_desde', vigenteDesde);
      const { data: existente } = await (
        categoriaId === null ? base.is('categoria_id', null) : base.eq('categoria_id', categoriaId)
      ).limit(1);

      if (existente?.[0]) {
        const { error } = await supabase
          .from('presupuestos')
          .update({ monto })
          .eq('id', existente[0].id);
        if (error) throw new Error(mensajeDeError(error));
        return;
      }

      const { error } = await supabase
        .from('presupuestos')
        .insert({ monto, vigente_desde: vigenteDesde, categoria_id: categoriaId });

      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.presupuestos });
      void qc.invalidateQueries({ queryKey: ['presupuesto'] });
    },
  });
}

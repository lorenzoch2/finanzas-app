import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import type { AjusteSaldo, BrechaAjuste, MotivoAjuste, NuevoAjuste } from '@/lib/database.types';

/**
 * Ajustes de saldo.
 *
 * Un ajuste corta la línea temporal de una fuente: define cuánto había en ella
 * en una fecha dada, y desde ahí el saldo vuelve a construirse sumando
 * movimientos. Es la pieza que permite arrancar sin cargar el historial
 * completo de una cuenta.
 *
 * Por eso `fecha_referencia` es un `date` y no un `timestamptz`: es un corte de
 * calendario, no un instante.
 */

export type AjusteConFuente = AjusteSaldo & {
  fuentes_cuentas: { id: string; nombre: string } | null;
};

/**
 * Por qué se declara un saldo.
 *
 * Solo dos de los cuatro mueven los totales del período: una apertura es el
 * punto de partida y una corrección arregla un error de tecleo, pero en
 * ninguna entra o sale dinero ahora.
 */
export const MOTIVOS: { valor: MotivoAjuste; etiqueta: string; explica: string }[] = [
  {
    valor: 'apertura',
    etiqueta: 'Capital que ya tenía',
    explica: 'El punto de partida. No cuenta como ingreso de ningún mes.',
  },
  {
    valor: 'ingreso_no_registrado',
    etiqueta: 'Entró plata y no la anoté',
    explica: 'La diferencia cuenta como ingreso de esta fecha.',
  },
  {
    valor: 'gasto_no_registrado',
    etiqueta: 'Salió plata y no la anoté',
    explica: 'La diferencia cuenta como gasto de esta fecha.',
  },
  {
    valor: 'correccion',
    etiqueta: 'Me equivoqué al anotar',
    explica: 'Corrige el saldo sin tocar los totales del período.',
  },
];

/**
 * Lo que revela cada ajuste: qué decía el libro, qué declaraste, y el hueco
 * entre ambos. Ese hueco es exactamente el dinero que se quedó sin registrar.
 */
export function useBrechas(zona: string) {
  return useQuery({
    queryKey: ['brechas', zona],
    queryFn: async (): Promise<BrechaAjuste[]> => {
      const { data, error } = await supabase.rpc('brecha_de_ajustes', { p_tz: zona });
      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
  });
}

export function useAjustes() {
  return useQuery({
    queryKey: claves.ajustes,
    queryFn: async (): Promise<AjusteConFuente[]> => {
      const { data, error } = await supabase
        .from('ajustes_saldos')
        .select('*, fuentes_cuentas(id, nombre)')
        .order('fecha_referencia', { ascending: false });

      if (error) throw new Error(mensajeDeError(error));
      return (data ?? []) as unknown as AjusteConFuente[];
    },
  });
}

const invalidar = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: claves.ajustes });
  void qc.invalidateQueries({ queryKey: ['saldos'] });
  void qc.invalidateQueries({ queryKey: ['resumen'] });
  // Un ajuste puede cambiar los ingresos y gastos del periodo, asi que el
  // analisis y el presupuesto tambien dejan de ser validos.
  void qc.invalidateQueries({ queryKey: ['brechas'] });
  void qc.invalidateQueries({ queryKey: ['analisis'] });
  void qc.invalidateQueries({ queryKey: ['presupuesto'] });
};

export function useCrearAjuste() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (ajuste: NuevoAjuste) => {
      if (!ajuste.fuente_id) throw new Error('Elige la fuente que estás ajustando.');
      if (!ajuste.fecha_referencia) throw new Error('Indica desde qué fecha rige el ajuste.');

      const { error } = await supabase.from('ajustes_saldos').insert(ajuste);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useEditarAjuste() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      cambios,
    }: {
      id: string;
      cambios: { fecha_referencia?: string; monto_ajustado?: number; nota?: string | null };
    }) => {
      const { error } = await supabase.from('ajustes_saldos').update(cambios).eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => invalidar(qc),
  });
}

export function useBorrarAjuste() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ajustes_saldos').delete().eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => invalidar(qc),
  });
}

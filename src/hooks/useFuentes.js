import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const toMonthKey = (date) => date.toISOString().slice(0, 7);

const monthRange = (date) => {
  const start = startOfMonth(date);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
};

const computeBalance = (sourceId, monthDate, transacciones, ajustes) => {
  const monthStart = startOfMonth(monthDate);

  const sourceAdjustments = ajustes
    .filter((adjustment) => adjustment.fuente_id === sourceId)
    .sort((a, b) => new Date(a.fecha_referencia) - new Date(b.fecha_referencia));

  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const nextMonthKey = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}-01`;
  const lastAdjustment = sourceAdjustments.filter((adjustment) => adjustment.fecha_referencia < nextMonthKey).at(-1);

  const saldoInicial = lastAdjustment ? Number(lastAdjustment.monto_ajustado || 0) : 0;
  const baseDate = lastAdjustment
    ? new Date(`${lastAdjustment.fecha_referencia}T00:00:00`)
    : new Date(2020, 0, 1);

  const relevantTransactions = transacciones.filter((transaction) => {
    if (transaction.fuente_id !== sourceId) return false;
    const transactionDate = new Date(transaction.fecha);
    return transactionDate >= baseDate && transactionDate < new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  });

  let saldoActual = saldoInicial;
  for (const transaction of relevantTransactions) {
    const amount = Number(transaction.monto || 0);
    saldoActual += transaction.tipo === 'ingreso' ? amount : -amount;
  }

  return { saldoInicial, saldoActual };
};

export function useFuentes(monthDate = new Date(), refreshKey = 0) {
  const [fuentes, setFuentes] = useState([]);
  const [transacciones, setTransacciones] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: fuentesData, error: fuentesError }, { data: transaccionesData, error: transaccionesError }, { data: ajustesData, error: ajustesError }] =
      await Promise.all([
        supabase.from('fuentes_cuentas').select('id, nombre, tipo, created_at').order('nombre', { ascending: true }),
        supabase.from('transacciones').select('id, tipo, monto, fecha, fuente_id, nota').order('fecha', { ascending: true }),
        supabase.from('ajustes_saldos').select('id, fuente_id, fecha_referencia, monto_ajustado, nota').order('fecha_referencia', { ascending: true }),
      ]);

    const firstError = fuentesError || transaccionesError || ajustesError;
    if (firstError) {
      setError(firstError.message);
    } else {
      setError(null);
    }

    setFuentes(fuentesData || []);
    setTransacciones(transaccionesData || []);
    setAjustes(ajustesData || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    load().finally(() => {
      if (!mounted) return;
    });

    return () => {
      mounted = false;
    };
  }, [load, refreshKey]);

  const balances = useMemo(() => {
    const monthDateSafe = monthDate instanceof Date ? monthDate : new Date(monthDate);
    return fuentes.map((fuente) => {
      const { saldoInicial, saldoActual } = computeBalance(fuente.id, monthDateSafe, transacciones, ajustes);
      return { ...fuente, saldoInicial, saldoActual };
    });
  }, [fuentes, transacciones, ajustes, monthDate]);

  const totalDisponible = balances.reduce((sum, fuente) => sum + Number(fuente.saldoActual || 0), 0);
  const monthExpenses = transacciones
    .filter((transaction) => transaction.tipo === 'egreso' && new Date(transaction.fecha).getMonth() === monthDate.getMonth() && new Date(transaction.fecha).getFullYear() === monthDate.getFullYear())
    .reduce((sum, transaction) => sum + Number(transaction.monto || 0), 0);

  const refresh = async () => {
    await load();
  };

  const createFuente = async ({ nombre, tipo }) => {
    const cleanNombre = nombre?.trim();
    if (!cleanNombre) {
      throw new Error('El nombre de la fuente es obligatorio.');
    }

    const { error: insertError } = await supabase.from('fuentes_cuentas').insert({ nombre: cleanNombre, tipo: tipo || 'cuenta' });
    if (insertError) throw insertError;
    await load();
  };

  return {
    fuentes: balances,
    loading,
    error,
    totalDisponible,
    monthExpenses,
    monthKey: toMonthKey(monthDate),
    monthRange: monthRange(monthDate),
    refetch: refresh,
    createFuente,
  };
}

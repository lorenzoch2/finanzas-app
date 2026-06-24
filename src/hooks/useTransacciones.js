import { useState } from 'react';
import { supabase } from '../services/supabaseClient';

export function useTransacciones() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createTransaction = async ({ transaccion, items = [] }) => {
    setLoading(true);
    setError(null);

    const { data: insertedTransaction, error: transactionError } = await supabase
      .from('transacciones')
      .insert(transaccion)
      .select('*')
      .single();

    if (transactionError) {
      setError(transactionError.message);
      setLoading(false);
      throw transactionError;
    }

    if (items.length) {
      const itemsPayload = items.map((item) => ({
        ...item,
        transaccion_id: insertedTransaction.id,
      }));

      const { error: itemsError } = await supabase.from('items_detalle').insert(itemsPayload);

      if (itemsError) {
        setError(itemsError.message);
        setLoading(false);
        throw itemsError;
      }
    }

    setLoading(false);
    return insertedTransaction;
  };

  const updateTransaction = async ({ id, transaccion, items = null }) => {
    setLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('transacciones')
      .update(transaccion)
      .eq('id', id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      throw updateError;
    }

    if (items !== null) {
      const { data: existingItems } = await supabase
        .from('items_detalle')
        .select('id')
        .eq('transaccion_id', id);

      const existingIds = new Set((existingItems || []).map((i) => i.id));
      const incomingIds = new Set(items.filter((i) => i.id).map((i) => i.id));

      const toDelete = [...existingIds].filter((i) => !incomingIds.has(i));
      if (toDelete.length) {
        const { error: deleteError } = await supabase
          .from('items_detalle')
          .delete()
          .in('id', toDelete);
        if (deleteError) {
          setError(deleteError.message);
          setLoading(false);
          throw deleteError;
        }
      }

      for (const item of items) {
        if (item.id) {
          const { id: _id, ...itemData } = item;
          const { error: itemUpdateError } = await supabase
            .from('items_detalle')
            .update(itemData)
            .eq('id', _id);
          if (itemUpdateError) {
            setError(itemUpdateError.message);
            setLoading(false);
            throw itemUpdateError;
          }
        }
      }

      const newItems = items.filter((i) => !i.id).map((i) => ({
        ...i,
        transaccion_id: id,
      }));
      if (newItems.length) {
        const { error: insertError } = await supabase
          .from('items_detalle')
          .insert(newItems);
        if (insertError) {
          setError(insertError.message);
          setLoading(false);
          throw insertError;
        }
      }
    }

    setLoading(false);
    return { id };
  };

  const deleteTransaction = async (id) => {
    setLoading(true);
    setError(null);

    const { error: itemsError } = await supabase
      .from('items_detalle')
      .delete()
      .eq('transaccion_id', id);

    if (itemsError) {
      setError(itemsError.message);
      setLoading(false);
      throw itemsError;
    }

    const { error: transactionError } = await supabase
      .from('transacciones')
      .delete()
      .eq('id', id);

    if (transactionError) {
      setError(transactionError.message);
      setLoading(false);
      throw transactionError;
    }

    setLoading(false);
  };

  const createUsage = async (usagePayload) => {
    const { data, error: usageError } = await supabase.from('uso_productos').insert(usagePayload).select('*');
    if (usageError) {
      setError(usageError.message);
      throw usageError;
    }
    return data;
  };

  return { createTransaction, updateTransaction, deleteTransaction, createUsage, loading, error };
}

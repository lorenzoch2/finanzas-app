import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export function useAjustesSaldos(refreshKey = 0) {
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('ajustes_saldos')
        .select('id, fuente_id, fecha_referencia, monto_ajustado, nota')
        .order('fecha_referencia', { ascending: false })
        .limit(50);

      if (!mounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setAjustes([]);
      } else {
        setError(null);
        setAjustes(data || []);
      }

      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const updateAjuste = async (id, payload) => {
    const { error: updateError } = await supabase
      .from('ajustes_saldos')
      .update(payload)
      .eq('id', id);

    if (updateError) throw updateError;
  };

  const deleteAjuste = async (id) => {
    const { error: deleteError } = await supabase
      .from('ajustes_saldos')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;
  };

  return { ajustes, loading, error, updateAjuste, deleteAjuste };
}

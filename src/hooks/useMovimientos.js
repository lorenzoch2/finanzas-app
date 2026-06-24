import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

export function useMovimientos(refreshKey = 0) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('transacciones')
        .select('*, items_detalle(*)')
        .order('fecha', { ascending: false })
        .limit(200);

      if (!mounted) return;

      if (fetchError) {
        setError(fetchError.message);
        setMovimientos([]);
      } else {
        setError(null);
        setMovimientos(data || []);
      }

      setLoading(false);
    };

    load();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  return { movimientos, loading, error };
}

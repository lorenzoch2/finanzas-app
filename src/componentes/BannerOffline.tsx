import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CloudOff, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useSincronizarCola } from '@/datos/transacciones';
import { leerCola } from '@/lib/colaOffline';
import { claves } from '@/lib/query';

/**
 * Estado de la conexión y de la cola pendiente.
 *
 * Se muestra solo cuando hay algo que decir: sin conexión, o con compras
 * esperando subir. Si todo está bien no ocupa espacio, que en un teléfono es
 * escaso.
 */

function useEstaEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const conectado = () => setEnLinea(true);
    const desconectado = () => setEnLinea(false);

    window.addEventListener('online', conectado);
    window.addEventListener('offline', desconectado);
    return () => {
      window.removeEventListener('online', conectado);
      window.removeEventListener('offline', desconectado);
    };
  }, []);

  return enLinea;
}

export default function BannerOffline() {
  const enLinea = useEstaEnLinea();
  const sincronizar = useSincronizarCola();

  const { data: pendientes = [] } = useQuery({
    queryKey: claves.cola,
    queryFn: () => leerCola(),
    // La cola vive en localStorage, no en el servidor: no hay nada que
    // refrescar por tiempo, solo cuando algo la modifica.
    staleTime: Infinity,
  });

  // Al recuperar la señal se sincroniza solo. Tener que acordarse de pulsar un
  // botón es exactamente lo que haría que las compras se quedaran sin subir.
  useEffect(() => {
    if (enLinea && pendientes.length > 0 && !sincronizar.isPending) {
      sincronizar.mutate();
    }
    // Se dispara al cambiar la conexión o el tamaño de la cola, no en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea, pendientes.length]);

  if (enLinea && pendientes.length === 0) return null;

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-campo px-4 py-3 text-sm ${
        enLinea
          ? 'border border-alerta/30 bg-alerta-suave text-alerta'
          : 'border border-borde bg-elevado text-tinta-2'
      }`}
    >
      {!enLinea ? (
        <WifiOff size={18} className="shrink-0" aria-hidden />
      ) : (
        <CloudOff size={18} className="shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        {!enLinea ? (
          <p>
            Sin conexión. Los gastos que registres quedan guardados aquí y suben solos cuando vuelva
            la señal.
          </p>
        ) : (
          <p>
            {pendientes.length} {pendientes.length === 1 ? 'gasto pendiente' : 'gastos pendientes'} de
            subir.
          </p>
        )}
      </div>

      {enLinea && pendientes.length > 0 ? (
        <button
          type="button"
          className="button-ghost shrink-0 px-2 py-1 text-alerta"
          onClick={() => sincronizar.mutate()}
          disabled={sincronizar.isPending}
          aria-label="Sincronizar ahora"
        >
          {sincronizar.isPending ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw size={16} aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}

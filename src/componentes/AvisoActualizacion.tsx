import { useRegisterSW } from 'virtual:pwa-register/react';
import { Download, X } from 'lucide-react';

/**
 * Aviso de versión nueva disponible.
 *
 * Sin esto la app era, en la práctica, imposible de actualizar: el service
 * worker estaba configurado en modo `prompt`, que instala la versión nueva
 * pero la deja esperando a que alguien decida activarla. Como no había nada
 * que preguntara, la espera era eterna y una PWA ya instalada seguía sirviendo
 * la versión vieja indefinidamente, por más veces que se publicara.
 *
 * Se prefiere preguntar antes que recargar solo: una recarga automática a
 * mitad de una boleta de veinte ítems se llevaría por delante lo escrito.
 */
export default function AvisoActualizacion() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Busca versiones nuevas cada hora mientras la app esté abierta. Sin
      // esto solo se comprobaría al arrancar, y una PWA instalada puede pasar
      // días sin cerrarse del todo.
      if (!registro) return;
      window.setInterval(() => void registro.update(), 60 * 60 * 1000);
    },
  });

  if (!hayVersionNueva) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-soft md:bottom-6"
    >
      <span className="shrink-0 rounded-xl bg-brand-50 p-2 text-brand-700">
        <Download size={18} aria-hidden />
      </span>

      <p className="min-w-0 flex-1 text-sm text-slate-700">
        Hay una versión nueva de Finanzapp.
      </p>

      <button
        type="button"
        className="button-primary shrink-0 px-3 py-2"
        onClick={() => void updateServiceWorker(true)}
      >
        Actualizar
      </button>

      <button
        type="button"
        className="button-ghost shrink-0 px-2 py-2"
        onClick={() => setHayVersionNueva(false)}
        aria-label="Ahora no"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}

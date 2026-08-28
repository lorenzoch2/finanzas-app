import { TriangleAlert } from 'lucide-react';

/**
 * Qué hacer cuando la app va por delante de la base.
 *
 * Las migraciones y el código se despliegan por separado, así que existe una
 * ventana en la que la app pide funciones que todavía no existen. Sin este
 * aviso, lo que se ve es un error de PostgREST sobre un nombre de función,
 * que no le dice a nadie qué hacer y parece que la app está rota.
 */
export default function AvisoMigracion() {
  return (
    <div className="card p-6 text-center">
      <TriangleAlert size={24} className="mx-auto mb-3 text-alerta" aria-hidden />
      <h2 className="text-lg font-bold text-tinta">Falta aplicar las migraciones</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-tinta-2">
        La app está pidiendo funciones que la base todavía no tiene. Aplica{' '}
        <code className="rounded bg-elevado px-1.5 py-0.5 text-xs">
          supabase/APLICAR-PENDIENTES.sql
        </code>{' '}
        en el editor SQL de Supabase y recarga.
      </p>
      <p className="mt-3 text-xs text-tinta-3">Tus datos están intactos.</p>
    </div>
  );
}

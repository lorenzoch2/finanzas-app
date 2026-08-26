import { Clock, LogOut, User } from 'lucide-react';
import { useSesion } from '@/auth/SesionProvider';
import { useEstadoApp } from '@/lib/estadoApp';
import { ZONAS_DISPONIBLES, formatearFechaHora, mesActual } from '@/lib/fecha';

export default function Preferencias() {
  const { usuario, cerrarSesion } = useSesion();
  const { zona, setZona } = useEstadoApp();
  const ahora = new Date();

  return (
    <section className="space-y-5">
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <User size={18} className="text-slate-400" aria-hidden />
          <h2 className="text-lg font-bold text-slate-900">Cuenta</h2>
        </div>
        <p className="text-sm text-slate-600">{usuario?.email}</p>
        <button type="button" className="button-secondary mt-4" onClick={() => void cerrarSesion()}>
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={18} className="text-slate-400" aria-hidden />
          <h2 className="text-lg font-bold text-slate-900">Zona horaria</h2>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Define en qué momento empieza y termina cada día y cada mes. Con la zona equivocada, un
          gasto de las 23:30 puede quedar contado en el día siguiente.
        </p>

        <select className="input" value={zona} onChange={(e) => setZona(e.target.value)}>
          {ZONAS_DISPONIBLES.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
          {ZONAS_DISPONIBLES.every((opcion) => opcion.value !== zona) ? (
            <option value={zona}>{zona} (de tu dispositivo)</option>
          ) : null}
        </select>

        <dl className="mt-4 space-y-1 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Ahora aquí</dt>
            <dd className="font-medium text-slate-900">{formatearFechaHora(ahora, zona)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Mes activo</dt>
            <dd className="font-medium text-slate-900">{mesActual(zona, ahora)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-slate-500">
          La preferencia se guarda en este dispositivo, no en la cuenta.
        </p>
      </div>
    </section>
  );
}

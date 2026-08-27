import { useState } from 'react';
import type { FormEvent } from 'react';
import { Clock, LogOut, Store, Target, Trash2, User } from 'lucide-react';
import { useSesion } from '@/auth/SesionProvider';
import {
  TIPOS_ESTABLECIMIENTO,
  etiquetaTipo,
  useBorrarEstablecimiento,
  useCrearEstablecimiento,
  useEstablecimientos,
} from '@/datos/establecimientos';
import { useAvancePresupuesto, useFijarPresupuesto } from '@/datos/presupuesto';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP, parsearMonto } from '@/lib/dinero';
import { ZONAS_DISPONIBLES, formatearFechaHora, formatearMes, mesActual } from '@/lib/fecha';
import type { TipoEstablecimiento } from '@/lib/database.types';

export default function Preferencias() {
  const { usuario, cerrarSesion } = useSesion();
  const { mes, zona, setZona } = useEstadoApp();
  const ahora = new Date();

  const avance = useAvancePresupuesto(mes, zona);
  const fijarPresupuesto = useFijarPresupuesto();
  const establecimientos = useEstablecimientos();
  const crearEstablecimiento = useCrearEstablecimiento();
  const borrarEstablecimiento = useBorrarEstablecimiento();

  const [limite, setLimite] = useState('');
  const [nombreLocal, setNombreLocal] = useState('');
  const [tipoLocal, setTipoLocal] = useState<TipoEstablecimiento>('supermercado');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const limiteActual = Number(avance.data?.limite ?? 0);

  const guardarLimite = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const monto = parsearMonto(limite);
    if (monto == null || monto < 0) {
      setError('Escribe un monto válido.');
      return;
    }

    try {
      await fijarPresupuesto.mutateAsync({ monto, mes });
      setLimite('');
      setAviso(`Límite de ${formatearMes(mes)} fijado en ${formatearCLP(monto)}.`);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar el límite.');
    }
  };

  const guardarLocal = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    try {
      await crearEstablecimiento.mutateAsync({ nombre: nombreLocal, tipo: tipoLocal });
      setNombreLocal('');
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar.');
    }
  };

  return (
    <section className="space-y-5">
      {error ? <p className="mensaje-error">{error}</p> : null}
      {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

      {/* --------------------------------------------------- Presupuesto */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Target size={18} className="text-slate-400" aria-hidden />
          <h2 className="text-lg font-bold text-slate-900">Límite de gasto mensual</h2>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Es un monto fijo, no un porcentaje de lo que entra. Por eso un traspaso entre tus cuentas o
          un ingreso fuera de lo normal no lo mueven: la referencia sigue siendo la misma justo el mes
          en que más falta hace.
        </p>

        {limiteActual > 0 ? (
          <div className="mb-4 rounded-2xl bg-brand-50 px-4 py-3 text-sm">
            <span className="text-slate-600">Límite vigente para {formatearMes(mes)}: </span>
            <strong className="text-brand-900">{formatearCLP(limiteActual)}</strong>
          </div>
        ) : null}

        <form onSubmit={(e) => void guardarLimite(e)} className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1.5">
            <label className="label" htmlFor="limite">
              {limiteActual > 0 ? 'Cambiar el límite' : 'Definir límite'}
            </label>
            <input
              id="limite"
              className="input"
              inputMode="decimal"
              placeholder="800.000"
              value={limite}
              onChange={(e) => setLimite(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="button-primary sm:mt-7 sm:w-auto"
            disabled={fijarPresupuesto.isPending}
          >
            Guardar
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500">
          Se aplica desde {formatearMes(mes)}. Los meses anteriores conservan el límite que regía
          entonces, para que las comparaciones pasadas sigan siendo honestas.
        </p>
      </div>

      {/* ----------------------------------------------- Establecimientos */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Store size={18} className="text-slate-400" aria-hidden />
          <h2 className="text-lg font-bold text-slate-900">Establecimientos</h2>
        </div>

        <p className="mb-4 text-sm text-slate-600">
          Registrar dónde compras es lo que permite comparar precios entre locales.
        </p>

        <form onSubmit={(e) => void guardarLocal(e)} className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="Nombre del local"
            value={nombreLocal}
            onChange={(e) => setNombreLocal(e.target.value)}
            required
          />
          <select
            className="input sm:w-44"
            value={tipoLocal}
            onChange={(e) => setTipoLocal(e.target.value as TipoEstablecimiento)}
          >
            {TIPOS_ESTABLECIMIENTO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
          <button type="submit" className="button-primary sm:w-auto" disabled={crearEstablecimiento.isPending}>
            Agregar
          </button>
        </form>

        {(establecimientos.data ?? []).length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600">
            Todavía no registras ningún local.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {establecimientos.data?.map((local) => (
              <li key={local.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{local.nombre}</p>
                  <p className="text-xs text-slate-500">{etiquetaTipo(local.tipo)}</p>
                </div>
                <button
                  type="button"
                  className="button-ghost px-2 py-1 text-slate-400 hover:text-rose-600"
                  onClick={() => void borrarEstablecimiento.mutateAsync(local.id)}
                  aria-label={`Borrar ${local.nombre}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Borrar un local no borra sus compras: quedan sin establecimiento.
        </p>
      </div>

      {/* ------------------------------------------------- Zona horaria */}
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

      {/* ------------------------------------------------------- Cuenta */}
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
    </section>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Clock, LogOut, Palette, Pencil, Plus, Store, Target, Trash2, User } from 'lucide-react';
import { useSesion } from '@/auth/SesionProvider';
import SelectorTema from '@/componentes/SelectorTema';
import FormularioPresupuesto from '@/componentes/FormularioPresupuesto';
import {
  TIPOS_ESTABLECIMIENTO,
  etiquetaTipo,
  useBorrarEstablecimiento,
  useCrearEstablecimiento,
  useEstablecimientos,
} from '@/datos/establecimientos';
import { useBorrarPresupuesto, usePresupuestos } from '@/datos/presupuesto';
import type { PresupuestoConFuentes } from '@/datos/presupuesto';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { ZONAS_DISPONIBLES, formatearFechaHora, mesActual } from '@/lib/fecha';
import { diaLegible } from '@/lib/rango';
import type { TipoEstablecimiento } from '@/lib/database.types';

export default function Preferencias() {
  const { usuario, cerrarSesion } = useSesion();
  const { zona, setZona } = useEstadoApp();
  const ahora = new Date();

  const presupuestos = usePresupuestos();
  const borrarPresupuesto = useBorrarPresupuesto();
  const establecimientos = useEstablecimientos();
  const crearEstablecimiento = useCrearEstablecimiento();
  const borrarEstablecimiento = useBorrarEstablecimiento();

  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<PresupuestoConFuentes | null>(null);
  const [nombreLocal, setNombreLocal] = useState('');
  const [tipoLocal, setTipoLocal] = useState<TipoEstablecimiento>('supermercado');
  const [error, setError] = useState<string | null>(null);

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

  const cerrarFormulario = () => {
    setCreando(false);
    setEditando(null);
  };

  const lista = presupuestos.data ?? [];

  return (
    <section className="space-y-5">
      {error ? <p className="mensaje-error">{error}</p> : null}

      {/* --------------------------------------------------- Presupuestos */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-tinta">
              <Target size={18} className="text-tinta-3" aria-hidden />
              Límites de gasto
            </h2>
            <p className="mt-1 text-sm text-tinta-2">
              Montos fijos, no porcentajes de lo que entra. Por eso un traspaso entre tus cuentas o
              un ingreso fuera de lo normal no los mueven.
            </p>
          </div>

          {!creando && !editando ? (
            <button
              type="button"
              className="button-secondary shrink-0"
              onClick={() => setCreando(true)}
            >
              <Plus size={16} aria-hidden /> Nuevo
            </button>
          ) : null}
        </div>

        {creando || editando ? (
          <div className="mb-5 rounded-tarjeta border border-borde bg-elevado p-4">
            <FormularioPresupuesto
              zona={zona}
              edicion={editando}
              onGuardado={cerrarFormulario}
              onCancelar={cerrarFormulario}
            />
          </div>
        ) : null}

        {lista.length === 0 && !creando ? (
          <p className="rounded-campo bg-elevado p-6 text-center text-sm text-tinta-2">
            Todavía no tienes límites. Puedes poner uno mensual general, o uno acotado a unas fechas,
            una categoría y unas cuentas concretas.
          </p>
        ) : (
          <ul className="divide-y divide-borde-suave">
            {lista.map((p) => {
              const fuentes = p.presupuesto_fuentes.length;
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-tinta">{p.nombre}</p>
                    <p className="text-xs text-tinta-3">
                      {diaLegible(p.fecha_inicio)} – {diaLegible(p.fecha_fin, true)}
                      {' · '}
                      {fuentes === 0 ? 'todas las cuentas' : `${fuentes} cuenta${fuentes > 1 ? 's' : ''}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold tabular-nums text-tinta">
                      {formatearCLP(p.monto)}
                    </span>
                    <button
                      type="button"
                      className="button-ghost px-2 py-1 text-tinta-3"
                      onClick={() => {
                        setEditando(p);
                        setCreando(false);
                      }}
                      aria-label={`Editar ${p.nombre}`}
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="button-ghost px-2 py-1 text-tinta-3 hover:text-sale"
                      onClick={() => void borrarPresupuesto.mutateAsync(p.id)}
                      aria-label={`Borrar ${p.nombre}`}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ----------------------------------------------- Establecimientos */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Store size={18} className="text-tinta-3" aria-hidden />
          <h2 className="text-lg font-bold text-tinta">Establecimientos</h2>
        </div>

        <p className="mb-4 text-sm text-tinta-2">
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
          <button
            type="submit"
            className="button-primary sm:w-auto"
            disabled={crearEstablecimiento.isPending}
          >
            Agregar
          </button>
        </form>

        {(establecimientos.data ?? []).length === 0 ? (
          <p className="rounded-campo bg-elevado p-4 text-center text-sm text-tinta-2">
            Todavía no registras ningún local.
          </p>
        ) : (
          <ul className="divide-y divide-borde-suave">
            {establecimientos.data?.map((local) => (
              <li key={local.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-tinta">{local.nombre}</p>
                  <p className="text-xs text-tinta-3">{etiquetaTipo(local.tipo)}</p>
                </div>
                <button
                  type="button"
                  className="button-ghost px-2 py-1 text-tinta-3 hover:text-sale"
                  onClick={() => void borrarEstablecimiento.mutateAsync(local.id)}
                  aria-label={`Borrar ${local.nombre}`}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-tinta-3">
          Borrar un local no borra sus compras: quedan sin establecimiento.
        </p>
      </div>

      {/* -------------------------------------------------------- Tema */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Palette size={18} className="text-tinta-3" aria-hidden />
          <h2 className="text-lg font-bold text-tinta">Apariencia</h2>
        </div>
        <p className="mb-4 text-sm text-tinta-2">
          En automático sigue a tu sistema y cambia sola al anochecer.
        </p>
        <SelectorTema />
      </div>

      {/* ------------------------------------------------- Zona horaria */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={18} className="text-tinta-3" aria-hidden />
          <h2 className="text-lg font-bold text-tinta">Zona horaria</h2>
        </div>

        <p className="mb-4 text-sm text-tinta-2">
          Define en qué momento empieza y termina cada día. Con la zona equivocada, un gasto de las
          23:30 puede quedar contado en el día siguiente.
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

        <dl className="mt-4 space-y-1 rounded-campo bg-elevado p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-2">Ahora aquí</dt>
            <dd className="font-medium text-tinta">{formatearFechaHora(ahora, zona)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tinta-2">Mes activo</dt>
            <dd className="font-medium text-tinta">{mesActual(zona, ahora)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-tinta-3">
          La preferencia se guarda en este dispositivo, no en la cuenta.
        </p>
      </div>

      {/* ------------------------------------------------------- Cuenta */}
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <User size={18} className="text-tinta-3" aria-hidden />
          <h2 className="text-lg font-bold text-tinta">Cuenta</h2>
        </div>
        <p className="text-sm text-tinta-2">{usuario?.email}</p>
        <button type="button" className="button-secondary mt-4" onClick={() => void cerrarSesion()}>
          <LogOut size={16} aria-hidden /> Cerrar sesión
        </button>
      </div>
    </section>
  );
}

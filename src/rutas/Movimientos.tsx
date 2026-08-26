import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import FormularioTransaccion from '@/componentes/FormularioTransaccion';
import { useBorrarTransaccion, useTransaccionesDelMes } from '@/datos/transacciones';
import type { TransaccionConDetalle } from '@/lib/database.types';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { formatearFechaHora, formatearMes } from '@/lib/fecha';

export default function Movimientos() {
  const { mes, zona } = useEstadoApp();
  const consulta = useTransaccionesDelMes(mes, zona);
  const borrar = useBorrarTransaccion();

  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [editando, setEditando] = useState<TransaccionConDetalle | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cerrarFormulario = () => {
    setFormularioAbierto(false);
    setEditando(null);
  };

  const pedirBorrado = async (id: string) => {
    // Dos toques: el primero pide confirmación en el mismo botón, sin diálogo.
    // Borrar arrastra el detalle completo por cascada, así que conviene que
    // cueste un gesto más.
    if (confirmando !== id) {
      setConfirmando(id);
      window.setTimeout(() => setConfirmando((actual) => (actual === id ? null : actual)), 4000);
      return;
    }

    setError(null);
    try {
      await borrar.mutateAsync(id);
      setConfirmando(null);
      if (expandida === id) setExpandida(null);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo borrar.');
    }
  };

  const transacciones = consulta.data ?? [];

  return (
    <section className="space-y-5">
      {editando || formularioAbierto ? (
        <FormularioTransaccion
          transaccion={editando}
          onGuardado={cerrarFormulario}
          onCancelar={cerrarFormulario}
        />
      ) : (
        <button type="button" className="button-primary w-full" onClick={() => setFormularioAbierto(true)}>
          <Plus size={18} aria-hidden /> Registrar movimiento
        </button>
      )}

      {error ? <p className="mensaje-error">{error}</p> : null}

      {consulta.error ? (
        <p className="mensaje-error flex items-start gap-2">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{consulta.error instanceof Error ? consulta.error.message : 'Error al cargar.'}</span>
        </p>
      ) : null}

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900 capitalize">{formatearMes(mes)}</h2>
          <span className="text-sm text-slate-500">
            {transacciones.length} {transacciones.length === 1 ? 'movimiento' : 'movimientos'}
          </span>
        </div>

        {consulta.isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…
          </p>
        ) : null}

        {!consulta.isPending && transacciones.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-6 text-center text-sm text-slate-600">
            No hay movimientos en este mes.
          </p>
        ) : null}

        <ul className="divide-y divide-slate-100">
          {transacciones.map((transaccion) => {
            const esIngreso = transaccion.tipo === 'ingreso';
            const items = transaccion.items_detalle ?? [];
            const abierta = expandida === transaccion.id;

            return (
              <li key={transaccion.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-xl p-2 ${
                      esIngreso ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {esIngreso ? (
                      <ArrowUpRight size={16} aria-hidden />
                    ) : (
                      <ArrowDownLeft size={16} aria-hidden />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold text-slate-900">
                        {transaccion.nota || (esIngreso ? 'Ingreso' : 'Gasto')}
                      </p>
                      <strong
                        className={`shrink-0 tabular-nums ${
                          esIngreso ? 'text-emerald-700' : 'text-slate-900'
                        }`}
                      >
                        {esIngreso ? '+' : '−'}
                        {formatearCLP(transaccion.monto)}
                      </strong>
                    </div>

                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatearFechaHora(new Date(transaccion.fecha), zona)}
                      {transaccion.fuentes_cuentas ? ` · ${transaccion.fuentes_cuentas.nombre}` : ''}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {items.length > 0 ? (
                        <button
                          type="button"
                          className="button-ghost px-2 py-1 text-xs"
                          onClick={() => setExpandida(abierta ? null : transaccion.id)}
                          aria-expanded={abierta}
                        >
                          <ChevronDown
                            size={14}
                            aria-hidden
                            className={`transition ${abierta ? 'rotate-180' : ''}`}
                          />
                          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                        </button>
                      ) : null}

                      {transaccion.monto_sin_detalle > 0 ? (
                        <span className="chip">
                          {formatearCLP(transaccion.monto_sin_detalle)} sin detalle
                        </span>
                      ) : null}

                      <button
                        type="button"
                        className="button-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          setEditando(transaccion);
                          setFormularioAbierto(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <Pencil size={14} aria-hidden /> Editar
                      </button>

                      <button
                        type="button"
                        className={`button-ghost px-2 py-1 text-xs ${
                          confirmando === transaccion.id ? 'bg-rose-50 text-rose-700' : 'text-slate-500'
                        }`}
                        onClick={() => void pedirBorrado(transaccion.id)}
                        disabled={borrar.isPending}
                      >
                        <Trash2 size={14} aria-hidden />
                        {confirmando === transaccion.id ? '¿Seguro?' : 'Borrar'}
                      </button>
                    </div>

                    {abierta ? (
                      <ul className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-slate-700">
                              {item.nombre_producto ?? 'Sin nombre'}
                              {item.marca ? (
                                <span className="text-slate-400"> · {item.marca}</span>
                              ) : null}
                              {Number(item.unidades) > 1 ? (
                                <span className="text-slate-400"> × {item.unidades}</span>
                              ) : null}
                              {item.tuvo_descuento ? (
                                <span className="ml-1 text-emerald-600">
                                  −{item.descuento_porcentaje}%
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-600">
                              {formatearCLP(item.total_linea)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

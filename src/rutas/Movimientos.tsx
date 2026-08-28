import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import FormularioTransaccion from '@/componentes/FormularioTransaccion';
import { useBorrarTransaccion, useTransaccionesDelRango } from '@/datos/transacciones';
import type { TransaccionConDetalle } from '@/lib/database.types';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { formatearFechaHora } from '@/lib/fecha';
import { nombrarRango } from '@/lib/rango';

export default function Movimientos() {
  const { rango, zona } = useEstadoApp();
  const consulta = useTransaccionesDelRango(rango.desde, rango.hasta, zona);
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
          <h2 className="text-lg font-bold text-tinta">{nombrarRango(rango)}</h2>
          <span className="text-sm text-tinta-3">
            {transacciones.length} {transacciones.length === 1 ? 'movimiento' : 'movimientos'}
          </span>
        </div>

        {consulta.isPending ? (
          <p className="flex items-center gap-2 text-sm text-tinta-3">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando…
          </p>
        ) : null}

        {!consulta.isPending && transacciones.length === 0 ? (
          <p className="rounded-tarjeta bg-elevado p-6 text-center text-sm text-tinta-2">
            No hay movimientos en este mes.
          </p>
        ) : null}

        <ul className="divide-y divide-borde-suave">
          {transacciones.map((transaccion) => {
            const esIngreso = transaccion.tipo === 'ingreso';
            const esTransferencia = transaccion.tipo === 'transferencia';
            const items = transaccion.items_detalle ?? [];
            const abierta = expandida === transaccion.id;

            /*
              Cada fila debe decir QUE fue, no de que tipo. Antes veinte filas
              seguidas decian «Gasto», que es justo lo que ya indica el icono y
              el signo del monto: la palabra no aportaba nada y la lista era
              indistinguible.

              Se usa lo mas informativo que haya: la nota si la escribiste, si
              no los productos, si no el local, y solo como ultimo recurso el
              tipo.
            */
            const productos = items
              .map((i) => i.productos?.nombre ?? i.nombre_producto)
              .filter((n): n is string => Boolean(n));

            const titulo = esTransferencia
              ? `${transaccion.fuentes_cuentas?.nombre ?? 'Origen'} → ${transaccion.destino?.nombre ?? 'Destino'}`
              : transaccion.nota ||
                (productos.length
                  ? productos.slice(0, 3).join(', ') +
                    (productos.length > 3 ? ` y ${productos.length - 3} más` : '')
                  : transaccion.establecimientos?.nombre) ||
                (esIngreso ? 'Ingreso' : 'Gasto');

            return (
              <li key={transaccion.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded-xl p-2 ${
                      esTransferencia
                        ? 'bg-elevado text-tinta-3'
                        : esIngreso
                          ? 'bg-entra-suave text-entra'
                          : 'bg-sale-suave text-sale'
                    }`}
                  >
                    {esTransferencia ? (
                      <Repeat size={16} aria-hidden />
                    ) : esIngreso ? (
                      <ArrowUpRight size={16} aria-hidden />
                    ) : (
                      <ArrowDownLeft size={16} aria-hidden />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate font-semibold text-tinta">{titulo}</p>
                      {/*
                        Un traspaso no lleva signo: no entra ni sale dinero del
                        patrimonio, solo cambia de cuenta.
                      */}
                      <strong
                        className={`shrink-0 tabular-nums ${
                          esTransferencia
                            ? 'text-tinta-3'
                            : esIngreso
                              ? 'text-entra'
                              : 'text-tinta'
                        }`}
                      >
                        {esTransferencia ? '' : esIngreso ? '+' : '−'}
                        {formatearCLP(transaccion.monto)}
                      </strong>
                    </div>

                    <p className="mt-0.5 text-xs text-tinta-3">
                      {formatearFechaHora(new Date(transaccion.fecha), zona)}
                      {!esTransferencia && transaccion.fuentes_cuentas
                        ? ` · ${transaccion.fuentes_cuentas.nombre}`
                        : ''}
                      {!esTransferencia && transaccion.establecimientos
                        ? ` · ${transaccion.establecimientos.nombre}`
                        : ''}
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

                      {/* Al peso, no a cualquier decimal: un resto de $0,4
                          mostraba la etiqueta «$0 sin detalle», que no dice
                          nada y ensucia la fila. */}
                      {Math.round(transaccion.monto_sin_detalle) > 0 ? (
                        <span className="chip">
                          {formatearCLP(transaccion.monto_sin_detalle)} sin detalle
                        </span>
                      ) : null}

                      {/*
                        Un traspaso no se edita con este formulario: convertiria
                        el movimiento en un egreso y la cuenta de destino se
                        quedaria con el dinero sumado y sin nadie que lo restara.
                        Si hay que corregirlo, se borra y se vuelve a hacer.
                      */}
                      {esTransferencia ? null : (
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
                      )}

                      <button
                        type="button"
                        className={`button-ghost px-2 py-1 text-xs ${
                          confirmando === transaccion.id ? 'bg-sale-suave text-sale' : 'text-tinta-3'
                        }`}
                        onClick={() => void pedirBorrado(transaccion.id)}
                        disabled={borrar.isPending}
                      >
                        <Trash2 size={14} aria-hidden />
                        {confirmando === transaccion.id ? '¿Seguro?' : 'Borrar'}
                      </button>
                    </div>

                    {abierta ? (
                      <ul className="mt-3 space-y-1.5 rounded-campo bg-elevado p-3">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-tinta-2">
                              {item.nombre_producto ?? 'Sin nombre'}
                              {item.marca ? (
                                <span className="text-tinta-3"> · {item.marca}</span>
                              ) : null}
                              {Number(item.unidades) > 1 ? (
                                <span className="text-tinta-3"> × {item.unidades}</span>
                              ) : null}
                              {item.tuvo_descuento ? (
                                <span className="ml-1 text-entra">
                                  −{item.descuento_porcentaje}%
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 tabular-nums text-tinta-2">
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

import { Link } from '@tanstack/react-router';
import { ArrowDownLeft, ArrowUpRight, ChartColumn, Loader2, Star, TriangleAlert } from 'lucide-react';
import { useResumen, useSaldos } from '@/datos/saldos';
import { useAvancePresupuestos } from '@/datos/presupuesto';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { nombrarRango } from '@/lib/rango';
import Medidor from '@/componentes/graficos/Medidor';
import AvisoMigracion from '@/componentes/AvisoMigracion';
import { faltaMigracion } from '@/lib/supabase';

/**
 * Pantalla de resumen.
 *
 * El total disponible va como cifra protagonista y no como una tarjeta más:
 * es el número con el que se abre la app, la respuesta a «¿cuánto tengo?».
 * Ingresos y gastos del mes lo acompañan en segundo plano, porque explican ese
 * número pero no son la pregunta.
 */

function Metrica({
  icono,
  tono,
  titulo,
  valor,
  cargando,
}: {
  icono: React.ReactNode;
  tono: string;
  titulo: string;
  valor: string;
  cargando: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-campo bg-tarjeta/70 px-4 py-3">
      <span className={`shrink-0 rounded-xl p-2 ${tono}`}>{icono}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-tinta-3">{titulo}</p>
        <p className="truncate text-lg font-bold tabular-nums text-tinta">
          {cargando ? <span className="text-tinta-3">—</span> : valor}
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { rango, zona } = useEstadoApp();
  const saldos = useSaldos(rango.hasta, zona);
  const resumen = useResumen(rango.desde, rango.hasta, zona);
  // Los presupuestos activos al cierre del período que se está mirando.
  const presupuestos = useAvancePresupuestos(rango.hasta, zona);

  const error = saldos.error ?? resumen.error;

  // El total se suma aquí en vez de pedírselo a la base: antes lo devolvía
  // `resumen_mensual`, que para calcularlo repetía el cálculo completo de
  // saldos. Sumar tres números en el cliente es gratis.
  const totalDisponible = (saldos.data ?? []).reduce(
    (suma, fuente) => suma + Number(fuente.saldo_actual || 0),
    0,
  );

  const margen = Number(resumen.data?.ingresos ?? 0) - Number(resumen.data?.gastos ?? 0);

  // La app puede desplegarse antes que sus migraciones: decirlo en claro es
  // mejor que un error sobre una funcion que no existe.
  if (error && faltaMigracion(error)) return <AvisoMigracion />;

  return (
    <section className="space-y-5">
      {error ? (
        <p className="mensaje-error flex items-start gap-2">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error instanceof Error ? error.message : 'No se pudieron cargar los saldos.'}</span>
        </p>
      ) : null}

      {/* Cifra protagonista */}
      <div className="card overflow-hidden">
        <div className="px-5 py-6 sm:px-6">
          <p className="text-xs font-semibold tracking-wide text-acento uppercase">
            Total disponible
          </p>
          <p className="mt-1 text-4xl font-black tracking-tight tabular-nums text-tinta sm:text-5xl">
            {saldos.isPending ? (
              <span className="text-tinta-3">—</span>
            ) : (
              formatearCLP(totalDisponible)
            )}
          </p>
          <p className="mt-1 text-sm text-tinta-3">
            Suma de tus {saldos.data?.length ?? 0}{' '}
            {(saldos.data?.length ?? 0) === 1 ? 'cuenta' : 'cuentas'}.
          </p>
        </div>

        <div className="grid gap-2 border-t border-borde-suave p-3 sm:grid-cols-3">
          <Metrica
            icono={<ArrowUpRight size={16} aria-hidden />}
            tono="bg-entra-suave text-entra"
            titulo={`Ingresos · ${nombrarRango(rango)}`}
            valor={formatearCLP(resumen.data?.ingresos)}
            cargando={resumen.isPending}
          />
          <Metrica
            icono={<ArrowDownLeft size={16} aria-hidden />}
            tono="bg-sale-suave text-sale"
            titulo={`Gastos · ${nombrarRango(rango)}`}
            valor={formatearCLP(resumen.data?.gastos)}
            cargando={resumen.isPending}
          />
          <Metrica
            icono={<ChartColumn size={16} aria-hidden />}
            tono={margen >= 0 ? 'bg-acento-suave text-acento' : 'bg-alerta-suave text-alerta'}
            titulo="Margen del período"
            valor={formatearCLP(margen)}
            cargando={resumen.isPending}
          />
        </div>
      </div>

      {/*
        Presupuestos: lo accionable va arriba, antes del detalle por cuenta.
        Pueden ser varios a la vez —un tope general y otro para un viaje—, así
        que se listan todos los que tocan este período.
      */}
      {(presupuestos.data ?? []).length > 0 ? (
        <div className="card p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-tinta">
            {(presupuestos.data ?? []).length === 1 ? 'Tu límite' : 'Tus límites'}
          </h2>
          <div className="space-y-6">
            {presupuestos.data?.map((p) => (
              <Medidor key={p.id} presupuesto={p} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-tinta">Tus cuentas</h2>
            <p className="mt-1 text-sm text-tinta-3">
              Cada saldo parte del último ajuste manual y suma los movimientos desde esa fecha.
            </p>
          </div>
          <Link to="/analisis" className="button-secondary shrink-0 px-3 py-2 text-xs">
            <ChartColumn size={14} aria-hidden /> Analizar
          </Link>
        </div>

        {saldos.isPending ? (
          <p className="flex items-center gap-2 text-sm text-tinta-3">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando saldos…
          </p>
        ) : null}

        {!saldos.isPending && saldos.data?.length === 0 ? (
          <div className="rounded-tarjeta bg-elevado p-6 text-center">
            <p className="text-sm text-tinta-2">Todavía no tienes cuentas.</p>
            <Link to="/saldos" className="button-primary mt-4">
              Crear la primera
            </Link>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {saldos.data?.map((fuente) => {
            const negativo = Number(fuente.saldo_actual) < 0;
            return (
              <article
                key={fuente.fuente_id}
                className={`rounded-tarjeta border p-4 transition ${
                  fuente.es_principal
                    ? 'border-acento-borde bg-acento-suave'
                    : 'border-borde bg-elevado'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-1.5 font-semibold text-tinta">
                    {fuente.es_principal ? (
                      <Star
                        size={13}
                        className="shrink-0 fill-acento text-acento"
                        aria-label="Cuenta principal"
                      />
                    ) : null}
                    <span className="truncate">{fuente.nombre}</span>
                  </h3>
                  <span className="chip shrink-0 bg-tarjeta">{fuente.tipo}</span>
                </div>

                <p
                  className={`text-2xl font-black tabular-nums ${
                    negativo ? 'text-sale' : 'text-tinta'
                  }`}
                >
                  {formatearCLP(fuente.saldo_actual)}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

import { Link } from '@tanstack/react-router';
import { ArrowDownLeft, ArrowUpRight, Loader2, TriangleAlert, Wallet } from 'lucide-react';
import { useResumen, useSaldos } from '@/datos/saldos';
import { useEstadoApp } from '@/lib/estadoApp';
import { formatearCLP } from '@/lib/dinero';
import { formatearMes } from '@/lib/fecha';

function Tarjeta({
  icono,
  tono,
  titulo,
  valor,
  nota,
  cargando,
}: {
  icono: React.ReactNode;
  tono: string;
  titulo: string;
  valor: string;
  nota: string;
  cargando: boolean;
}) {
  return (
    <article className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className={`rounded-2xl p-3 ${tono}`}>{icono}</span>
        <span className="text-xs font-semibold text-slate-500">{titulo}</span>
      </div>
      <p className="text-3xl font-black tracking-tight text-slate-900 tabular-nums">
        {cargando ? <span className="text-slate-300">—</span> : valor}
      </p>
      <p className="mt-2 text-sm text-slate-500">{nota}</p>
    </article>
  );
}

export default function Dashboard() {
  const { mes, zona } = useEstadoApp();
  const saldos = useSaldos(mes, zona);
  const resumen = useResumen(mes, zona);

  const error = saldos.error ?? resumen.error;

  return (
    <section className="space-y-6">
      {error ? (
        <p className="mensaje-error flex items-start gap-2">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <span>{error instanceof Error ? error.message : 'No se pudieron cargar los saldos.'}</span>
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Tarjeta
          icono={<Wallet size={18} aria-hidden />}
          tono="bg-brand-50 text-brand-700"
          titulo="Total disponible"
          valor={formatearCLP(resumen.data?.total_disponible)}
          nota="Balance consolidado por fuente de dinero."
          cargando={resumen.isPending}
        />
        <Tarjeta
          icono={<ArrowDownLeft size={18} aria-hidden />}
          tono="bg-rose-50 text-rose-600"
          titulo="Gastos del mes"
          valor={formatearCLP(resumen.data?.gastos)}
          nota={`Egresos registrados en ${formatearMes(mes)}.`}
          cargando={resumen.isPending}
        />
        <Tarjeta
          icono={<ArrowUpRight size={18} aria-hidden />}
          tono="bg-emerald-50 text-emerald-600"
          titulo="Ingresos del mes"
          valor={formatearCLP(resumen.data?.ingresos)}
          nota={`Ingresos registrados en ${formatearMes(mes)}.`}
          cargando={resumen.isPending}
        />
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-slate-900">Saldo por fuente</h2>
          <p className="text-sm text-slate-500">
            Cada saldo parte del último ajuste manual anterior al cierre del mes y suma los
            movimientos desde esa fecha.
          </p>
        </div>

        {saldos.isPending ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" aria-hidden /> Cargando saldos…
          </p>
        ) : null}

        {!saldos.isPending && saldos.data?.length === 0 ? (
          <div className="rounded-3xl bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-600">Todavía no tienes fuentes de dinero.</p>
            <Link to="/saldos" className="button-primary mt-4">
              Crear la primera
            </Link>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {saldos.data?.map((fuente) => {
            const negativo = Number(fuente.saldo_actual) < 0;
            return (
              <article
                key={fuente.fuente_id}
                className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold text-slate-900">{fuente.nombre}</h3>
                  <span className="chip shrink-0 bg-white">{fuente.tipo}</span>
                </div>
                <p
                  className={`text-2xl font-black tabular-nums ${
                    negativo ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {formatearCLP(fuente.saldo_actual)}
                </p>
                {Number(fuente.saldo_inicial) !== 0 ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Desde ajuste de {formatearCLP(fuente.saldo_inicial)}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Link to="/movimientos" className="button-secondary">
            Ver movimientos
          </Link>
        </div>
      </div>
    </section>
  );
}

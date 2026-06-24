import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Wallet } from 'lucide-react';
import { useFuentes } from '../hooks/useFuentes';
import { formatCLP } from '../utils/format';

const monthToDate = (monthKey) => new Date(`${monthKey}-01T00:00:00`);

export default function Dashboard({ onOpenMovimientos, refreshKey = 0 }) {
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7));
  const monthDate = useMemo(() => monthToDate(monthKey), [monthKey]);
  const { fuentes, totalDisponible, monthExpenses, loading, error } = useFuentes(monthDate, refreshKey);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-2xl bg-brand-50 p-3 text-brand-700"><Wallet size={18} /></span>
            <span className="text-xs font-semibold text-slate-500">Total disponible</span>
          </div>
          <p className="text-3xl font-black tracking-tight text-slate-900">{formatCLP(totalDisponible)}</p>
          <p className="mt-2 text-sm text-slate-500">Balance consolidado por fuente de dinero.</p>
        </article>
        <article className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-2xl bg-rose-50 p-3 text-rose-600"><ArrowDownLeft size={18} /></span>
            <span className="text-xs font-semibold text-slate-500">Gastos del mes</span>
          </div>
          <p className="text-3xl font-black tracking-tight text-slate-900">{formatCLP(monthExpenses)}</p>
          <p className="mt-2 text-sm text-slate-500">Auditoría sobre el mes seleccionado.</p>
        </article>
        <article className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><ArrowUpRight size={18} /></span>
            <span className="text-xs font-semibold text-slate-500">Mes activo</span>
          </div>
          <p className="text-3xl font-black tracking-tight text-slate-900">{monthKey}</p>
          <p className="mt-2 text-sm text-slate-500">Cálculo con continuidad o ajuste manual.</p>
        </article>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Auditoría temporal</h2>
            <p className="text-sm text-slate-500">Cambia el mes para recalcular el saldo vivo de cada fuente.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            <CalendarDays size={16} />
            <input className="bg-transparent outline-none" type="month" value={monthKey} onChange={(event) => setMonthKey(event.target.value)} />
          </label>
        </div>

        {loading ? <p className="text-sm text-slate-500">Cargando saldos...</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fuentes.map((fuente) => (
            <article key={fuente.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900">{fuente.nombre}</h3>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500">{fuente.tipo}</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{formatCLP(fuente.saldoActual)}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button type="button" className="button-secondary" onClick={onOpenMovimientos}>
            Ver movimientos
          </button>
        </div>
      </div>
    </section>
  );
}

import { useState } from 'react';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import TransactionForm from './components/TransactionForm';
import BalanceManager from './components/BalanceManager';
import MovimientosList from './components/MovimientosList';
import AjustesList from './components/AjustesList';
import CategoriesManager from './components/CategoriesManager';
import { useFuentes } from './hooks/useFuentes';

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [refreshToken, setRefreshToken] = useState(0);
  const { fuentes, refetch, loading } = useFuentes(new Date(), refreshToken);

  const handleUpdated = async () => {
    setRefreshToken((value) => value + 1);
    await refetch();
  };

  return (
    <div className="min-h-screen">
      <Navbar activeView={activeView} onChangeView={setActiveView} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {activeView === 'dashboard' ? <Dashboard refreshKey={refreshToken} onOpenMovimientos={() => setActiveView('movimientos')} /> : null}

        {activeView === 'movimientos' ? (
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <TransactionForm key={refreshToken} fuentes={fuentes} onSaved={handleUpdated} />
              <MovimientosList fuentes={fuentes} refreshKey={refreshToken} onUpdated={handleUpdated} />
            </div>
            <div className="space-y-6">
              <section className="card p-5">
                <h2 className="text-lg font-bold text-slate-900">Resumen</h2>
                <p className="mt-2 text-sm text-slate-600">{loading ? 'Cargando fuentes...' : `Fuentes disponibles: ${fuentes.length}`}</p>
              </section>
            </div>
          </div>
        ) : null}

        {activeView === 'saldos' ? (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <BalanceManager fuentes={fuentes} onUpdated={handleUpdated} onFuenteCreated={handleUpdated} />
              <AjustesList fuentes={fuentes} refreshKey={refreshToken} onUpdated={handleUpdated} />
            </div>
            <section className="card p-5 sm:p-6">
              <h2 className="text-lg font-bold text-slate-900">Concepto de saldos</h2>
              <p className="mt-2 text-sm text-slate-600">
                Aquí administras el punto de partida de cada cuenta. Un ajuste manual redefine la continuidad temporal desde la fecha indicada.
              </p>
              <div className="mt-4 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Reglas</p>
                <ul className="mt-2 space-y-2">
                  <li>1. Los movimientos registran ingresos y egresos.</li>
                  <li>2. Los saldos heredan el remanente mensual automáticamente.</li>
                  <li>3. Un ajuste manual corta la línea temporal y define un nuevo punto de partida.</li>
                </ul>
              </div>
            </section>
          </div>
        ) : null}

        {activeView === 'categorias' ? <CategoriesManager /> : null}
      </main>
    </div>
  );
}

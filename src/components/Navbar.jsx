import { WalletCards, ArrowUpCircle, LayoutDashboard, Tags } from 'lucide-react';

export default function Navbar({ activeView, onChangeView }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'movimientos', label: 'Movimientos', icon: ArrowUpCircle },
    { id: 'saldos', label: 'Saldos', icon: WalletCards },
    { id: 'categorias', label: 'Categorías', icon: Tags },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">finanzas-app</p>
          <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Orden absoluto del dinero</h1>
        </div>
        <nav className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button key={item.id} type="button" onClick={() => onChangeView(item.id)} className={`button ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                <Icon size={16} />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

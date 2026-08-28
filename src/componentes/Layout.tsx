import type { ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  ChartColumn,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings2,
  Tags,
  WalletCards,
} from 'lucide-react';
import { useSesion } from '@/auth/SesionProvider';
import SelectorMes from './SelectorMes';
import BannerOffline from './BannerOffline';
import SelectorTema from './SelectorTema';

/**
 * Estructura de la app.
 *
 * Mobile-first de verdad: en el teléfono la navegación es una barra inferior
 * al alcance del pulgar, porque el uso real es registrar una compra de pie en
 * el supermercado. En pantallas grandes esa misma navegación sube al encabezado.
 */

const VISTAS = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard },
  { to: '/movimientos', label: 'Movimientos', icon: Receipt },
  { to: '/analisis', label: 'Análisis', icon: ChartColumn },
  { to: '/saldos', label: 'Saldos', icon: WalletCards },
  { to: '/categorias', label: 'Categorías', icon: Tags },
] as const;

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, cerrarSesion } = useSesion();
  const ruta = useRouterState({ select: (estado) => estado.location.pathname });

  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-borde bg-tarjeta/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.3em] text-acento uppercase">
                finanzapp
              </p>
              <h1 className="truncate text-lg font-black tracking-tight text-tinta sm:text-xl">
                Orden absoluto del dinero
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <SelectorMes />

              <SelectorTema compacto />

              <Link
                to="/preferencias"
                className="button-ghost px-3"
                aria-label="Preferencias"
                title="Preferencias"
              >
                <Settings2 size={18} aria-hidden />
              </Link>

              <button
                type="button"
                onClick={() => void cerrarSesion()}
                className="button-ghost px-3"
                aria-label={`Cerrar sesión de ${usuario?.email ?? ''}`}
                title="Cerrar sesión"
              >
                <LogOut size={18} aria-hidden />
              </button>
            </div>
          </div>

          {/* Navegación de escritorio */}
          <nav className="mt-3 hidden md:flex">
            <div className="flex rounded-campo border border-borde bg-elevado p-1">
              {VISTAS.map(({ to, label, icon: Icono }) => (
                <Link
                  key={to}
                  to={to}
                  className={`button ${
                    ruta === to ? 'bg-tarjeta text-acento shadow-sm' : 'text-tinta-2 hover:text-tinta'
                  }`}
                >
                  <Icono size={16} aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-5 sm:px-6 lg:px-8">
        <BannerOffline />
        {children}
      </main>

      {/* Navegación móvil, al alcance del pulgar */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-borde bg-tarjeta/95 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1">
          {VISTAS.map(({ to, label, icon: Icono }) => {
            const activa = ruta === to;
            return (
              <Link
                key={to}
                to={to}
                aria-current={activa ? 'page' : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium transition ${
                  activa ? 'text-acento' : 'text-tinta-3'
                }`}
              >
                <Icono size={20} aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

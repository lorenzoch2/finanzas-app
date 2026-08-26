import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import Layout from '@/componentes/Layout';
import Dashboard from '@/rutas/Dashboard';
import Movimientos from '@/rutas/Movimientos';
import Saldos from '@/rutas/Saldos';
import Categorias from '@/rutas/Categorias';
import Preferencias from '@/rutas/Preferencias';

/**
 * Rutas definidas en código, no por archivos.
 *
 * Para cinco pantallas, el enrutado por archivos añadiría un plugin de build y
 * un routeTree generado que hay que mantener sincronizado, sin ganar nada: el
 * tipado es igual de estricto por ambos caminos.
 *
 * Que la navegación pase por URL importa más de lo que parece en una PWA
 * instalada: el botón atrás del teléfono funciona, recargar no te devuelve al
 * inicio, y se puede compartir un enlace directo a una vista.
 */

const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Dashboard,
});

const movimientosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/movimientos',
  component: Movimientos,
});

const saldosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/saldos',
  component: Saldos,
});

const categoriasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categorias',
  component: Categorias,
});

const preferenciasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preferencias',
  component: Preferencias,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  movimientosRoute,
  saldosRoute,
  categoriasRoute,
  preferenciasRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

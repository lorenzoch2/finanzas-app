import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
} from '@tanstack/react-router';
import Layout from '@/componentes/Layout';

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
 *
 * Cada vista se carga por separado. En un solo bundle eran 656 kB para ver el
 * resumen del mes, y esta app se abre de pie en el supermercado con datos
 * móviles. `defaultPreload: 'intent'` hace que el trozo se descargue al tocar
 * el enlace, así que el corte no se nota al navegar.
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
  component: lazyRouteComponent(() => import('@/rutas/Dashboard')),
});

const movimientosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/movimientos',
  component: lazyRouteComponent(() => import('@/rutas/Movimientos')),
});

const saldosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/saldos',
  component: lazyRouteComponent(() => import('@/rutas/Saldos')),
});

const categoriasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/categorias',
  component: lazyRouteComponent(() => import('@/rutas/Categorias')),
});

const analisisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analisis',
  component: lazyRouteComponent(() => import('@/rutas/Analisis')),
});

const preferenciasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/preferencias',
  component: lazyRouteComponent(() => import('@/rutas/Preferencias')),
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  movimientosRoute,
  analisisRoute,
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

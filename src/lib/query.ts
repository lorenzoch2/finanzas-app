import { QueryClient } from '@tanstack/react-query';

/**
 * Cliente de TanStack Query.
 *
 * Reemplaza el patrón anterior de `refreshToken` + `refetch()` manual: la app
 * vieja incrementaba un contador en App.jsx y lo pasaba como prop a cada
 * componente para forzar recargas, lo que hacía que guardar una transacción
 * volviera a bajar TODAS las transacciones, fuentes y ajustes.
 *
 * Aquí las mutaciones invalidan solo las claves afectadas.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los saldos cambian solo cuando tú registras algo, y las mutaciones ya
      // invalidan lo que corresponde. No hace falta refrescar por tiempo.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: (contador, error) => {
        // Un fallo de permisos no se arregla reintentando.
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const codigo = String((error as { code: unknown }).code);
          if (codigo === '42501' || codigo === 'PGRST301') return false;
        }
        return contador < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Claves de consulta en un solo lugar.
 *
 * Tenerlas centralizadas evita el problema clásico de invalidar con una clave
 * que no coincide con la que se usó al consultar, y que la pantalla quede
 * mostrando datos viejos sin que nada falle visiblemente.
 */
export const claves = {
  fuentes: ['fuentes'] as const,
  saldos: (mes: string) => ['saldos', mes] as const,
  resumen: (mes: string) => ['resumen', mes] as const,
  transacciones: (mes: string) => ['transacciones', mes] as const,
  transaccion: (id: string) => ['transaccion', id] as const,
  ajustes: ['ajustes'] as const,
  categorias: ['categorias'] as const,
} satisfies Record<string, readonly unknown[] | ((...args: never[]) => readonly unknown[])>;

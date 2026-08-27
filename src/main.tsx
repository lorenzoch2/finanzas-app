import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { SesionProvider, useSesion } from '@/auth/SesionProvider';
import { EstadoAppProvider } from '@/lib/estadoApp';
import { queryClient } from '@/lib/query';
import { router } from '@/router';
import Login from '@/rutas/Login';
import CambiarPassword from '@/rutas/CambiarPassword';
import LimiteDeError from '@/componentes/LimiteDeError';
import './index.css';

/**
 * Punto de entrada.
 *
 * El orden de los proveedores importa: la sesión envuelve a todo porque el
 * resto de la app no tiene sentido sin saber quién eres, y con RLS activo
 * cualquier consulta sin sesión devolvería cero filas en silencio.
 */

function Puerta() {
  const { sesion, cargando, recuperandoPassword } = useSesion();

  // Mientras se recupera la sesión guardada no se sabe si hay usuario.
  // Tratar este instante como "sin sesión" haría parpadear el login en cada
  // recarga de página.
  if (cargando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-brand-500" size={28} aria-label="Cargando" />
      </div>
    );
  }

  if (!sesion) return <Login />;

  // Va antes del router: quien llega por el enlace de recuperación tiene una
  // sesión válida, así que si no se le corta el paso aquí entraría al
  // dashboard sin haber cambiado nunca la contraseña.
  if (recuperandoPassword) return <CambiarPassword />;

  return (
    <EstadoAppProvider>
      <RouterProvider router={router} />
    </EstadoAppProvider>
  );
}

const contenedor = document.getElementById('root');
if (!contenedor) throw new Error('No se encontró #root en index.html.');

createRoot(contenedor).render(
  <StrictMode>
    <LimiteDeError>
      <QueryClientProvider client={queryClient}>
        <SesionProvider>
          <Puerta />
        </SesionProvider>
      </QueryClientProvider>
    </LimiteDeError>
  </StrictMode>,
);

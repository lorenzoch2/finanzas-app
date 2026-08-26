import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Estado de sesión de la app.
 *
 * `cargando` empieza en true y es importante: mientras Supabase recupera la
 * sesión guardada, no se sabe todavía si hay usuario. Si se tratara ese
 * instante como "no hay sesión", cada recarga de página mandaría al login por
 * una fracción de segundo antes de volver.
 */

interface EstadoSesion {
  sesion: Session | null;
  usuario: User | null;
  cargando: boolean;
  cerrarSesion: () => Promise<void>;
}

const SesionContext = createContext<EstadoSesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!activo) return;
        setSesion(data.session);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    // Cubre el refresco de token, el cierre de sesión en otra pestaña y la
    // expiración. Sin esto, la app seguiría mostrando datos con una sesión
    // muerta hasta el próximo request fallido.
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      if (!activo) return;
      setSesion(nuevaSesion);
      setCargando(false);
    });

    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo<EstadoSesion>(
    () => ({ sesion, usuario: sesion?.user ?? null, cargando, cerrarSesion }),
    [sesion, cargando, cerrarSesion],
  );

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion(): EstadoSesion {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de <SesionProvider>.');
  }
  return contexto;
}

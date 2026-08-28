import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { mesActual } from './fecha';
import { useZonaHoraria } from './preferencias';
import { rangoDeMes } from './rango';
import type { Rango } from './rango';

/**
 * Estado compartido por las pantallas: el período que se está mirando y la
 * zona horaria con la que se interpreta.
 *
 * Vive en un contexto porque todas las vistas deben mirar el MISMO período: en
 * la versión original cada componente tenía su propio mes y podían mostrarse a
 * la vez dos números de meses distintos.
 *
 * Arranca en el mes actual porque es el 90% de los casos, pero el período es
 * un rango libre: el mes es un atajo, no una limitación.
 */

interface EstadoApp {
  rango: Rango;
  setRango: (rango: Rango) => void;
  zona: string;
  setZona: (zona: string) => void;
  /**
   * El mes del rango, si es que lo es. Lo usan las pantallas que solo tienen
   * sentido mes a mes; las demás trabajan con `rango` directamente.
   */
  mes: string | undefined;
}

const Contexto = createContext<EstadoApp | null>(null);

export function EstadoAppProvider({ children }: { children: ReactNode }) {
  const [zona, setZona] = useZonaHoraria();
  const [rango, setRangoEstado] = useState<Rango>(() => rangoDeMes(mesActual(zona)));

  const setRango = useCallback((nuevo: Rango) => setRangoEstado(nuevo), []);

  const valor = useMemo<EstadoApp>(
    () => ({ rango, setRango, zona, setZona, mes: rango.mes }),
    [rango, setRango, zona, setZona],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstadoApp(): EstadoApp {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useEstadoApp debe usarse dentro de <EstadoAppProvider>.');
  return contexto;
}

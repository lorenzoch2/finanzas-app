import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { mesActual } from './fecha';
import { useZonaHoraria } from './preferencias';

/**
 * Estado compartido por las pantallas: el mes que se está mirando y la zona
 * horaria con la que se interpreta.
 *
 * Vive en un contexto porque el Dashboard y Movimientos deben mirar el mismo
 * mes: en la versión anterior cada componente tenía su propio `useState` con el
 * mes, así que cambiarlo en el Dashboard no afectaba a la lista de movimientos
 * y los dos números que se veían en pantalla podían ser de meses distintos.
 */

interface EstadoApp {
  mes: string;
  setMes: (mes: string) => void;
  zona: string;
  setZona: (zona: string) => void;
}

const Contexto = createContext<EstadoApp | null>(null);

export function EstadoAppProvider({ children }: { children: ReactNode }) {
  const [zona, setZona] = useZonaHoraria();
  const [mes, setMes] = useState(() => mesActual(zona));

  const valor = useMemo<EstadoApp>(() => ({ mes, setMes, zona, setZona }), [mes, zona, setZona]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useEstadoApp(): EstadoApp {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useEstadoApp debe usarse dentro de <EstadoAppProvider>.');
  return contexto;
}

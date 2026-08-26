import { useCallback, useEffect, useState } from 'react';
import { ZONA_POR_DEFECTO, esZonaValida } from './fecha';

/**
 * Preferencias locales del dispositivo.
 *
 * Van en localStorage y no en la base: la zona horaria es del aparato desde el
 * que registras, no de la cuenta. Todo acceso va envuelto en try/catch porque
 * en modo privado o con las cookies bloqueadas, leer localStorage lanza.
 */

const CLAVE_ZONA = 'finanzapp:zona';

const leer = (clave: string): string | null => {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
};

const escribir = (clave: string, valor: string): void => {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // Sin persistencia se sigue funcionando con el valor en memoria.
  }
};

const zonaInicial = (): string => {
  const guardada = leer(CLAVE_ZONA);
  if (guardada && esZonaValida(guardada)) return guardada;

  // Si el dispositivo declara una zona válida, es mejor punto de partida que
  // asumir Santiago para alguien que esté viajando.
  try {
    const delSistema = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (delSistema && esZonaValida(delSistema)) return delSistema;
  } catch {
    // Intl siempre existe en los navegadores objetivo; el catch es por si acaso.
  }

  return ZONA_POR_DEFECTO;
};

export function useZonaHoraria(): [string, (zona: string) => void] {
  const [zona, setZonaEstado] = useState<string>(zonaInicial);

  const setZona = useCallback((nueva: string) => {
    if (!esZonaValida(nueva)) return;
    setZonaEstado(nueva);
    escribir(CLAVE_ZONA, nueva);
  }, []);

  // Mantiene sincronizadas dos pestañas abiertas a la vez.
  useEffect(() => {
    const alCambiar = (evento: StorageEvent) => {
      if (evento.key === CLAVE_ZONA && evento.newValue && esZonaValida(evento.newValue)) {
        setZonaEstado(evento.newValue);
      }
    };
    window.addEventListener('storage', alCambiar);
    return () => window.removeEventListener('storage', alCambiar);
  }, []);

  return [zona, setZona];
}

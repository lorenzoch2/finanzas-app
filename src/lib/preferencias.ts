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

/**
 * Tema: claro, oscuro o el del sistema.
 *
 * Por defecto sigue al sistema, que es lo que espera casi todo el mundo, pero
 * la elección explícita gana en ambos sentidos: alguien con el sistema en
 * oscuro puede querer la app en claro.
 *
 * Se aplica escribiendo `data-theme` en <html>, que es donde el CSS espera
 * encontrarlo. Se guarda por dispositivo, como la zona horaria: el teléfono y
 * el escritorio se usan en condiciones de luz distintas.
 */

const CLAVE_TEMA = 'finanzapp:tema';

export type Tema = 'sistema' | 'claro' | 'oscuro';

const esTema = (valor: string | null): valor is Tema =>
  valor === 'sistema' || valor === 'claro' || valor === 'oscuro';

const aplicarTema = (tema: Tema): void => {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema);
};

export function useTema(): [Tema, (tema: Tema) => void] {
  const [tema, setTemaEstado] = useState<Tema>(() => {
    const guardado = leer(CLAVE_TEMA);
    return esTema(guardado) ? guardado : 'sistema';
  });

  // Se aplica también al montar: el atributo no sobrevive a una recarga.
  useEffect(() => {
    aplicarTema(tema);
  }, [tema]);

  const setTema = useCallback((nuevo: Tema) => {
    setTemaEstado(nuevo);
    escribir(CLAVE_TEMA, nuevo);
  }, []);

  return [tema, setTema];
}

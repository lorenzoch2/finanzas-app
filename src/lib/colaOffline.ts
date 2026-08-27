import type { ItemFormulario, TransaccionFormulario } from '@/datos/transacciones';

/**
 * Cola de escrituras pendientes para cuando no hay red.
 *
 * El motivo: la app existe para anotar la compra de pie en el supermercado, y
 * ahí es donde peor cobertura hay. Sin esto, el gasto se pierde justo en el
 * caso de uso que justificó todo el rediseño.
 *
 * ALCANCE DELIBERADO: solo se encolan transacciones NUEVAS.
 *
 * Editar y borrar siguen exigiendo conexión, y es una decisión, no un olvido.
 * Encolar una edición obliga a resolver conflictos —¿qué pasa si la
 * transacción cambió en otro dispositivo, o si se edita dos veces sin
 * sincronizar?— y ese enredo no se paga con el beneficio: editar una boleta
 * vieja sin señal es raro; anotar una compra sin señal es lo normal.
 *
 * ALMACENAMIENTO: localStorage, no IndexedDB. La cola guarda a lo sumo unas
 * pocas boletas de unos pocos kB, y ser síncrono simplifica el vaciado al
 * arrancar. Cada acceso va con try/catch porque en modo privado o con las
 * cookies bloqueadas, leer localStorage lanza excepción.
 */

const CLAVE = 'finanzapp:cola-pendiente';

export interface OperacionPendiente {
  id: string;
  creadaEn: string;
  transaccion: TransaccionFormulario;
  items: ItemFormulario[];
}

const nuevoId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

export const leerCola = (): OperacionPendiente[] => {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];

    const datos: unknown = JSON.parse(crudo);
    if (!Array.isArray(datos)) return [];

    // Se filtra por forma: un localStorage corrupto no debe tumbar la app.
    return datos.filter(
      (op): op is OperacionPendiente =>
        typeof op === 'object' &&
        op !== null &&
        typeof (op as OperacionPendiente).id === 'string' &&
        typeof (op as OperacionPendiente).transaccion === 'object',
    );
  } catch {
    return [];
  }
};

const escribirCola = (cola: OperacionPendiente[]): void => {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(cola));
  } catch {
    // Sin espacio o sin permiso: se pierde la persistencia, no la app.
  }
};

export const encolar = (
  transaccion: TransaccionFormulario,
  items: ItemFormulario[],
): OperacionPendiente => {
  const operacion: OperacionPendiente = {
    id: nuevoId(),
    creadaEn: new Date().toISOString(),
    transaccion,
    items,
  };

  escribirCola([...leerCola(), operacion]);
  return operacion;
};

export const quitarDeCola = (id: string): void => {
  escribirCola(leerCola().filter((op) => op.id !== id));
};

export const vaciarCola = (): void => escribirCola([]);

/**
 * ¿Este fallo es de red, o el servidor rechazó la operación?
 *
 * Distinguirlos importa: encolar un rechazo del servidor haría reintentarlo
 * para siempre, y cada reintento fallaría igual. Solo se encola lo que tiene
 * posibilidad real de funcionar más tarde.
 */
export const esFalloDeRed = (error: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const mensaje = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|err_internet|timeout/i.test(
    mensaje,
  );
};

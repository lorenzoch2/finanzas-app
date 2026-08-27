import { beforeEach, describe, expect, it } from 'vitest';
import { encolar, esFalloDeRed, leerCola, quitarDeCola, vaciarCola } from './colaOffline';
import type { ItemFormulario, TransaccionFormulario } from '@/datos/transacciones';

const transaccion = (monto: number): TransaccionFormulario => ({
  tipo: 'egreso',
  monto,
  fecha: '2026-08-15T18:00:00.000Z',
  fuente_id: null,
  fuente_destino_id: null,
  establecimiento_id: null,
  nota: 'compra',
  monto_sin_detalle: 0,
});

const items: ItemFormulario[] = [
  {
    producto_id: null,
    nombre_producto: 'Arroz',
    marca: 'Tucapel',
    categoria_id: '',
    unidades: 2,
    cantidad_medida: null,
    precio_unitario: 1990,
    descuento_monto: 0,
    calificacion: null,
  },
];

describe('cola offline', () => {
  beforeEach(() => {
    vaciarCola();
  });

  it('empieza vacía', () => {
    expect(leerCola()).toEqual([]);
  });

  it('conserva la transacción y su detalle', () => {
    encolar(transaccion(12500), items);

    const cola = leerCola();
    expect(cola).toHaveLength(1);
    expect(cola[0]?.transaccion.monto).toBe(12500);
    expect(cola[0]?.items[0]?.nombre_producto).toBe('Arroz');
    expect(cola[0]?.items[0]?.unidades).toBe(2);
  });

  it('mantiene el orden en que se registraron', () => {
    // Importa: si se suben desordenadas, el historial queda desordenado.
    encolar(transaccion(1000), []);
    encolar(transaccion(2000), []);
    encolar(transaccion(3000), []);

    expect(leerCola().map((op) => op.transaccion.monto)).toEqual([1000, 2000, 3000]);
  });

  it('da a cada operación un id distinto', () => {
    encolar(transaccion(1000), []);
    encolar(transaccion(1000), []);

    const [primera, segunda] = leerCola();
    expect(primera?.id).not.toBe(segunda?.id);
  });

  it('quita solo la operación indicada', () => {
    encolar(transaccion(1000), []);
    encolar(transaccion(2000), []);

    const objetivo = leerCola()[0];
    quitarDeCola(objetivo?.id ?? '');

    expect(leerCola().map((op) => op.transaccion.monto)).toEqual([2000]);
  });

  it('ignora un id que no existe sin romper la cola', () => {
    encolar(transaccion(1000), []);
    quitarDeCola('no-existe');
    expect(leerCola()).toHaveLength(1);
  });

  it('sobrevive a un localStorage corrupto', () => {
    // Un JSON inválido, o válido pero con otra forma, no debe tumbar la app:
    // se descarta lo que no calza en vez de propagar la excepción.
    window.localStorage.setItem('finanzapp:cola-pendiente', 'esto no es json');
    expect(leerCola()).toEqual([]);

    window.localStorage.setItem('finanzapp:cola-pendiente', '{"no":"es un arreglo"}');
    expect(leerCola()).toEqual([]);

    window.localStorage.setItem('finanzapp:cola-pendiente', '[{"basura":true},null,3]');
    expect(leerCola()).toEqual([]);
  });
});

describe('esFalloDeRed', () => {
  it('reconoce los fallos de red por su mensaje', () => {
    expect(esFalloDeRed(new Error('Failed to fetch'))).toBe(true);
    expect(esFalloDeRed(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
    expect(esFalloDeRed(new Error('Network request failed'))).toBe(true);
    expect(esFalloDeRed(new Error('Load failed'))).toBe(true);
    expect(esFalloDeRed(new Error('request timeout'))).toBe(true);
  });

  it('NO confunde un rechazo del servidor con un fallo de red', () => {
    // Es la distinción que evita reintentar para siempre algo que el servidor
    // va a rechazar igual en cada intento.
    expect(esFalloDeRed(new Error('permission denied for table transacciones'))).toBe(false);
    expect(esFalloDeRed(new Error('Los datos no cumplen una validación de la base.'))).toBe(false);
    expect(esFalloDeRed(new Error('Sin sesión activa.'))).toBe(false);
  });
});

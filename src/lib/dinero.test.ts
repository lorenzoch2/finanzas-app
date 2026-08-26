import { describe, expect, it } from 'vitest';
import {
  aPesos,
  formatearCLP,
  montoDesdePorcentaje,
  parsearMonto,
  porcentajeDescuento,
  precioConDescuento,
  totalLinea,
} from './dinero';

describe('parsearMonto', () => {
  /**
   * En Chile el separador de miles es el punto. `Number("12.500")` da 12,5:
   * un error de mil veces al registrar un gasto. Este es el caso que más
   * barato sale prevenir y más caro sale descubrir tarde.
   */
  it('trata el punto como separador de miles', () => {
    expect(parsearMonto('12.500')).toBe(12500);
    expect(parsearMonto('1.234.567')).toBe(1234567);
  });

  it('trata la coma como decimal, al modo chileno', () => {
    expect(parsearMonto('1.234,56')).toBeCloseTo(1234.56);
    expect(parsearMonto('0,5')).toBeCloseTo(0.5);
  });

  it('acepta también el formato inglés', () => {
    expect(parsearMonto('1234.56')).toBeCloseTo(1234.56);
    expect(parsearMonto('1,234.56')).toBeCloseTo(1234.56);
  });

  it('ignora símbolos y espacios', () => {
    expect(parsearMonto('$ 12.500')).toBe(12500);
    expect(parsearMonto('  8690  ')).toBe(8690);
  });

  it('distingue vacío de cero', () => {
    // Un campo en blanco no es un gasto de $0: es un dato que falta.
    expect(parsearMonto('')).toBeNull();
    expect(parsearMonto(null)).toBeNull();
    expect(parsearMonto('   ')).toBeNull();
    expect(parsearMonto('0')).toBe(0);
  });

  it('deja pasar números tal cual', () => {
    expect(parsearMonto(4200)).toBe(4200);
    expect(parsearMonto(Number.NaN)).toBeNull();
  });
});

describe('descuentos', () => {
  /**
   * Casos tomados de la forma real de los datos históricos, donde
   * `descuento_monto` es el dinero ahorrado y el porcentaje se deriva.
   * La base los calcula igual, en columnas generadas.
   */
  it('reproduce la cadena precio -> descuento -> precio final', () => {
    expect(precioConDescuento(8690, 2899.85)).toBeCloseTo(5790.15, 2);
    expect(precioConDescuento(18000, 5400)).toBe(12600);
    expect(precioConDescuento(1250, 305)).toBe(945);
  });

  it('deriva el porcentaje desde el monto ahorrado', () => {
    expect(porcentajeDescuento(8690, 2899.85)).toBeCloseTo(33.37, 2);
    expect(porcentajeDescuento(18000, 5400)).toBe(30);
    expect(porcentajeDescuento(1250, 305)).toBe(24.4);
  });

  it('convierte una tasa en el monto que se guarda', () => {
    expect(montoDesdePorcentaje(18000, 30)).toBe(5400);
    expect(montoDesdePorcentaje(8690, 33.37)).toBeCloseTo(2899.85, 2);
  });

  it('nunca deja un precio negativo', () => {
    // Un descuento mayor que el precio regala plata, no la cobra al revés.
    expect(precioConDescuento(1000, 1500)).toBe(0);
    expect(totalLinea(1000, 1500, 3)).toBe(0);
  });

  it('no divide por cero cuando no hay precio', () => {
    expect(porcentajeDescuento(0, 500)).toBe(0);
    expect(montoDesdePorcentaje(0, 30)).toBe(0);
  });

  it('acota la tasa a 0..100', () => {
    expect(montoDesdePorcentaje(1000, 150)).toBe(1000);
    expect(montoDesdePorcentaje(1000, -20)).toBe(0);
  });
});

describe('totalLinea', () => {
  it('multiplica el precio ya descontado por las unidades', () => {
    expect(totalLinea(1250, 305, 2)).toBe(1890);
    expect(totalLinea(3800, 1140, 3)).toBe(7980);
  });

  it('toma 1 unidad cuando no se especifica', () => {
    expect(totalLinea(5000, 0, 0)).toBe(5000);
  });
});

describe('formateo', () => {
  it('muestra CLP sin decimales', () => {
    // El CLP no usa centavos aunque el dato los tenga guardados.
    expect(formatearCLP(5790.15).replace(/ /g, ' ')).toContain('5.790');
    expect(formatearCLP(0).replace(/ /g, ' ')).toContain('0');
  });

  it('trata null como cero al mostrar', () => {
    expect(formatearCLP(null)).toBe(formatearCLP(0));
    expect(formatearCLP(undefined)).toBe(formatearCLP(0));
  });

  it('aPesos redondea al peso más cercano', () => {
    expect(aPesos(5790.15)).toBe(5790);
    expect(aPesos(5790.85)).toBe(5791);
  });
});

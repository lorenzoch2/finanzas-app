import { describe, expect, it } from 'vitest';
import {
  descuentoDeItem,
  itemVacio,
  sumarDetalle,
  tieneContenido,
  totalDeItem,
} from './esquemaTransaccion';
import type { ValoresItem } from './esquemaTransaccion';

const item = (cambios: Partial<ValoresItem>): ValoresItem => ({ ...itemVacio(), ...cambios });

describe('totalDeItem', () => {
  it('multiplica precio por unidades en un producto envasado', () => {
    expect(totalDeItem(item({ precio_unitario: '1990', unidades: '2' }))).toBe(3980);
  });

  /**
   * El caso que más fácil se calcula mal.
   *
   * En un producto a granel el precio es POR KILO y lo que multiplica es el
   * peso comprado, no el número de paquetes. La hallulla real: 0,674 kg a
   * $1.890/kg son $1.274. Tratarlo como «1 unidad a $1.890» daría $1.890, un
   * 48% de más, sin que nada avise.
   *
   * Distinguir ambos casos era imposible cuando el peso vivía en un texto
   * libre junto a gramajes de envase y medidas de objetos.
   */
  it('multiplica precio por kilo por el peso comprado, no por unidades', () => {
    const hallulla = item({
      vendido_por: 'peso',
      precio_unitario: '1890',
      cantidad_medida: '0,674',
      unidades: '1',
    });

    expect(totalDeItem(hallulla)).toBeCloseTo(1273.86, 2);
  });

  it('ignora las unidades en un producto a granel', () => {
    // Cambiar las unidades no debe alterar nada: lo que manda es el peso.
    const base = { vendido_por: 'peso' as const, precio_unitario: '2000', cantidad_medida: '0,5' };
    expect(totalDeItem(item({ ...base, unidades: '1' }))).toBe(1000);
    expect(totalDeItem(item({ ...base, unidades: '7' }))).toBe(1000);
  });

  it('aplica el descuento antes de multiplicar', () => {
    const conDescuento = item({
      precio_unitario: '18000',
      descuento_tipo: 'porcentaje',
      descuento_valor: '30',
      unidades: '2',
    });

    // 18.000 - 30% = 12.600, por 2 unidades.
    expect(totalDeItem(conDescuento)).toBe(25200);
  });

  it('aplica el descuento también a granel, sobre el precio por kilo', () => {
    const granel = item({
      vendido_por: 'peso',
      precio_unitario: '2000',
      descuento_tipo: 'porcentaje',
      descuento_valor: '25',
      cantidad_medida: '2',
    });

    // 2.000 - 25% = 1.500 por kilo, por 2 kilos.
    expect(totalDeItem(granel)).toBe(3000);
  });

  it('toma 1 unidad cuando el campo esta vacio', () => {
    expect(totalDeItem(item({ precio_unitario: '5000', unidades: '' }))).toBe(5000);
  });

  it('entiende el punto como separador de miles', () => {
    // «12.500» son doce mil quinientos, no doce con cinco.
    expect(totalDeItem(item({ precio_unitario: '12.500', unidades: '1' }))).toBe(12500);
  });
});

describe('descuentoDeItem', () => {
  it('convierte un porcentaje en el monto que se guarda', () => {
    expect(descuentoDeItem(item({ precio_unitario: '18000', descuento_tipo: 'porcentaje', descuento_valor: '30' }))).toBe(5400);
  });

  it('respeta un descuento capturado como monto', () => {
    expect(descuentoDeItem(item({ precio_unitario: '6790', descuento_tipo: 'monto', descuento_valor: '1400' }))).toBe(1400);
  });

  it('nunca descuenta mas que el precio', () => {
    // Un descuento mayor que el precio regalaria plata en vez de cobrarla.
    expect(descuentoDeItem(item({ precio_unitario: '1000', descuento_tipo: 'monto', descuento_valor: '5000' }))).toBe(1000);
  });

  it('es cero cuando no hay descuento', () => {
    expect(descuentoDeItem(item({ precio_unitario: '1000', descuento_tipo: 'ninguno', descuento_valor: '99' }))).toBe(0);
  });
});

describe('tieneContenido', () => {
  it('descarta las filas en blanco', () => {
    expect(tieneContenido(itemVacio())).toBe(false);
  });

  it('cuenta una fila con producto del catalogo aunque no tenga precio todavia', () => {
    expect(tieneContenido(item({ producto_id: 'abc' }))).toBe(true);
  });

  it('cuenta una fila con nombre escrito a mano', () => {
    expect(tieneContenido(item({ nombre_producto: 'Pan' }))).toBe(true);
  });
});

describe('sumarDetalle', () => {
  it('suma solo las filas con contenido', () => {
    const items = [
      item({ precio_unitario: '1000', unidades: '2' }),
      itemVacio(),
      item({ precio_unitario: '500', unidades: '1' }),
    ];

    expect(sumarDetalle(items)).toBe(2500);
  });

  it('mezcla envasados y granel correctamente', () => {
    const items = [
      item({ precio_unitario: '1990', unidades: '2' }),
      item({ vendido_por: 'peso', precio_unitario: '1890', cantidad_medida: '0,674' }),
    ];

    expect(sumarDetalle(items)).toBeCloseTo(3980 + 1273.86, 2);
  });
});

import { z } from 'zod';
import { montoDesdePorcentaje, parsearMonto, totalLinea } from '@/lib/dinero';

/**
 * Esquema y cálculos del formulario de transacción.
 *
 * Vive aparte del componente para que la fila de ítem, el bloque de totales y
 * el formulario compartan exactamente las mismas reglas. Cuando cada uno
 * calculaba lo suyo, el total que se veía y el que se guardaba podían
 * divergir.
 *
 * Los campos numéricos son texto a propósito: es lo que devuelve un <input>, y
 * convertirlos antes de tiempo obligaría a decidir qué significa un campo a
 * medio escribir. `parsearMonto` los interpreta al final, entendiendo que en
 * Chile «12.500» son doce mil quinientos.
 */

export const itemSchema = z.object({
  /** Del catálogo. Vacío mientras el producto todavía no existe. */
  producto_id: z.string(),
  nombre_producto: z.string().trim(),
  marca: z.string().trim(),
  categoria_id: z.string(),
  unidades: z.string(),
  /**
   * Peso real de ESTA compra, solo para productos a granel. El contenido de un
   * envase cerrado no va aquí: vive en el producto, porque no cambia entre
   * compras.
   */
  cantidad_medida: z.string(),
  /** Se copia del producto elegido; decide si se pide el peso. */
  vendido_por: z.enum(['unidad', 'peso']),
  precio_unitario: z.string(),
  descuento_tipo: z.enum(['ninguno', 'porcentaje', 'monto']),
  descuento_valor: z.string(),
  calificacion: z.string(),
});

export const esquemaTransaccion = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.string().min(1, 'Indica el monto.'),
  fuente_id: z.string(),
  establecimiento_id: z.string(),
  fecha: z.string().min(1, 'Indica la fecha.'),
  nota: z.string().trim(),
  detallado: z.boolean(),
  items: z.array(itemSchema),
});

export type ValoresTransaccion = z.infer<typeof esquemaTransaccion>;
export type ValoresItem = z.infer<typeof itemSchema>;

export const itemVacio = (): ValoresItem => ({
  producto_id: '',
  nombre_producto: '',
  marca: '',
  categoria_id: '',
  unidades: '1',
  cantidad_medida: '',
  vendido_por: 'unidad',
  precio_unitario: '',
  descuento_tipo: 'ninguno',
  descuento_valor: '',
  calificacion: '',
});

/**
 * Descuento por unidad en pesos, venga capturado como tasa o como monto.
 *
 * Siempre se guarda en pesos: es la única fuente de verdad en la base y el
 * porcentaje se deriva. Así no se repite el problema histórico de que las
 * mismas dos columnas significaran cosas distintas según quién escribiera.
 */
export const descuentoDeItem = (item: ValoresItem): number => {
  const precio = parsearMonto(item.precio_unitario) ?? 0;
  const valor = parsearMonto(item.descuento_valor) ?? 0;

  if (item.descuento_tipo === 'porcentaje') return montoDesdePorcentaje(precio, valor);
  if (item.descuento_tipo === 'monto') return Math.min(valor, precio);
  return 0;
};

/**
 * Total de la línea.
 *
 * En un producto a granel el precio es por kilo y lo que multiplica es el peso
 * comprado, no el número de paquetes: 0,674 kg de hallulla a $1.890/kg son
 * $1.274, no $1.890. Confundir ambos casos era imposible de detectar cuando el
 * peso vivía en un texto libre junto a gramajes y medidas.
 */
export const totalDeItem = (item: ValoresItem): number => {
  const precio = parsearMonto(item.precio_unitario) ?? 0;
  const descuento = descuentoDeItem(item);

  if (item.vendido_por === 'peso') {
    const peso = parsearMonto(item.cantidad_medida) ?? 0;
    return Math.max(precio - descuento, 0) * peso;
  }

  return totalLinea(precio, descuento, parsearMonto(item.unidades) ?? 1);
};

/** Un ítem cuenta si tiene algo escrito; los renglones en blanco se descartan. */
export const tieneContenido = (item: ValoresItem): boolean =>
  Boolean(item.producto_id || item.nombre_producto || item.precio_unitario);

export const sumarDetalle = (items: ValoresItem[]): number =>
  items.filter(tieneContenido).reduce((suma, item) => suma + totalDeItem(item), 0);

import { z } from 'zod';
import { montoDesdePorcentaje, parsearMonto, totalLinea } from '@/lib/dinero';

/**
 * Esquema y cálculos del formulario de transacción.
 *
 * Vive aparte del componente para que la fila de ítem, el bloque de totales y
 * el formulario compartan exactamente las mismas reglas. Cuando cada uno
 * calculaba lo suyo, el total que se veía en pantalla y el que se guardaba
 * podían divergir.
 *
 * Los campos numéricos son texto a propósito: es lo que devuelve un <input>, y
 * convertirlos temprano obligaría a decidir qué significa un campo a medio
 * escribir. `parsearMonto` los interpreta al final, entendiendo que en Chile
 * "12.500" son doce mil quinientos.
 */

export const itemSchema = z.object({
  nombre_producto: z.string().trim(),
  marca: z.string().trim(),
  categoria_id: z.string(),
  unidades: z.string(),
  peso_volumen: z.string().trim(),
  precio_unitario: z.string(),
  descuento_tipo: z.enum(['ninguno', 'porcentaje', 'monto']),
  descuento_valor: z.string(),
  calificacion: z.string(),
});

export const esquemaTransaccion = z.object({
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.string().min(1, 'Indica el monto.'),
  fuente_id: z.string(),
  fecha: z.string().min(1, 'Indica la fecha.'),
  nota: z.string().trim(),
  detallado: z.boolean(),
  items: z.array(itemSchema),
});

export type ValoresTransaccion = z.infer<typeof esquemaTransaccion>;
export type ValoresItem = z.infer<typeof itemSchema>;

export const itemVacio = (): ValoresItem => ({
  nombre_producto: '',
  marca: '',
  categoria_id: '',
  unidades: '1',
  peso_volumen: '',
  precio_unitario: '',
  descuento_tipo: 'ninguno',
  descuento_valor: '',
  calificacion: '',
});

/**
 * Descuento por unidad en pesos, venga capturado como tasa o como monto.
 *
 * Siempre se guarda en pesos: es la única fuente de verdad en la base, y el
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

export const totalDeItem = (item: ValoresItem): number =>
  totalLinea(
    parsearMonto(item.precio_unitario) ?? 0,
    descuentoDeItem(item),
    parsearMonto(item.unidades) ?? 1,
  );

/** Un ítem cuenta si tiene algo escrito; los renglones en blanco se descartan. */
export const tieneContenido = (item: ValoresItem): boolean =>
  Boolean(item.nombre_producto || item.precio_unitario || item.descuento_valor);

export const sumarDetalle = (items: ValoresItem[]): number =>
  items.filter(tieneContenido).reduce((suma, item) => suma + totalDeItem(item), 0);

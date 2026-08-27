/**
 * Dinero en pesos chilenos.
 *
 * Dos cosas que importan aquí:
 *
 * 1. El CLP no usa decimales en la práctica, pero los datos históricos SÍ los
 *    tienen: un descuento de 33,37% sobre $8.690 dejó $5.790,15 guardado. No se
 *    redondea al guardar, porque eso alteraría tus datos; se redondea solo al
 *    mostrar.
 *
 * 2. En Chile el separador de miles es el punto. Si alguien escribe "1.234"
 *    pensando en mil doscientos treinta y cuatro, `Number("1.234")` devuelve
 *    1,234 — un error de mil veces. `parsearMonto` lo maneja.
 */

const FORMATO_CLP = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatearCLP = (valor: number | string | null | undefined): string =>
  FORMATO_CLP.format(aNumero(valor));

export const aNumero = (valor: number | string | null | undefined): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Interpreta lo que el usuario escribió en un campo de monto.
 *
 *   "1.234"     -> 1234    (punto como separador de miles)
 *   "1.234,56"  -> 1234.56 (coma decimal, formato chileno)
 *   "1234.56"   -> 1234.56 (punto decimal, formato inglés)
 *   "$ 12.500"  -> 12500
 *   ""          -> null    (vacío no es cero: deja distinguir "sin dato")
 */
export const parsearMonto = (entrada: string | number | null | undefined): number | null => {
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null;
  if (entrada == null) return null;

  const limpio = entrada.replace(/[^\d.,-]/g, '').trim();
  if (!limpio) return null;

  const tieneComa = limpio.includes(',');
  const tienePunto = limpio.includes('.');

  let normalizado: string;

  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal.
    normalizado =
      limpio.lastIndexOf(',') > limpio.lastIndexOf('.')
        ? limpio.replace(/\./g, '').replace(',', '.')
        : limpio.replace(/,/g, '');
  } else if (tieneComa) {
    // Coma sola: decimal en formato chileno.
    normalizado = limpio.replace(',', '.');
  } else if (tienePunto) {
    // Punto solo: es separador de miles salvo que deje 1 o 2 dígitos al final,
    // que es la forma habitual de escribir centavos.
    const [, decimales = ''] = limpio.split(/\.(?=[^.]*$)/);
    normalizado = decimales.length <= 2 && limpio.split('.').length === 2
      ? limpio
      : limpio.replace(/\./g, '');
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
};

/** Redondeo a peso entero, para totales que se muestran o se comparan. */
export const aPesos = (valor: number | string | null | undefined): number =>
  Math.round(aNumero(valor));

/**
 * Precio final de una línea tras el descuento.
 *
 * Réplica exacta de la regla que la base de datos aplica en la columna
 * generada `precio_final`, para que el formulario muestre en vivo el mismo
 * número que se va a guardar.
 */
export const precioConDescuento = (precioUnitario: number, descuentoMonto: number): number =>
  Math.max(aNumero(precioUnitario) - aNumero(descuentoMonto), 0);

export const totalLinea = (precioUnitario: number, descuentoMonto: number, unidades: number): number =>
  precioConDescuento(precioUnitario, descuentoMonto) * Math.max(aNumero(unidades) || 1, 0);

/** Porcentaje que representa un descuento, para mostrarlo junto al monto. */
export const porcentajeDescuento = (precioUnitario: number, descuentoMonto: number): number => {
  const base = aNumero(precioUnitario);
  if (base === 0) return 0;
  return Math.round((aNumero(descuentoMonto) / base) * 10000) / 100;
};

/** Convierte una tasa de descuento en el monto que la base guarda. */
export const montoDesdePorcentaje = (precioUnitario: number, porcentaje: number): number => {
  const base = aNumero(precioUnitario);
  const tasa = Math.min(Math.max(aNumero(porcentaje), 0), 100);
  return (base * tasa) / 100;
};

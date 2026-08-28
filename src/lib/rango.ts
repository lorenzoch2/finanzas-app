import { mesActual, mesAnterior, mesSiguiente, primerDiaDelMes } from './fecha';

/**
 * Rangos de fecha.
 *
 * El mes deja de estar incrustado en la app y pasa a ser lo que siempre debió
 * ser: el rango más habitual, no el único posible. «Agosto», «los últimos tres
 * meses» y «del 3 al 17» son ahora la misma cosa con distintos extremos.
 *
 * Ambos extremos van incluidos: un rango de un solo día es desde = hasta, que
 * es lo que espera cualquiera que elija la misma fecha dos veces.
 */

export interface Rango {
  desde: string; // 'YYYY-MM-DD'
  hasta: string; // 'YYYY-MM-DD'
  /** Qué atajo lo generó, para poder resaltarlo y navegar por meses. */
  preset: Preset;
  /** Solo cuando el preset es un mes: 'YYYY-MM'. Permite las flechas. */
  mes?: string;
}

export type Preset =
  | 'mes'
  | 'mes-anterior'
  | 'ultimos-3'
  | 'ultimos-6'
  | 'ultimos-12'
  | 'ano'
  | 'personalizado';

const pad = (n: number) => String(n).padStart(2, '0');

/** Último día del mes 'YYYY-MM', respetando años bisiestos. */
export const ultimoDiaDelMes = (mes: string): string => {
  const [year, month] = mes.split('-').map(Number);
  if (!year || !month) return `${mes}-28`;
  // Día 0 del mes siguiente es el último del actual.
  const fecha = new Date(Date.UTC(year, month, 0));
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}`;
};

export const rangoDeMes = (mes: string, preset: Preset = 'mes'): Rango => ({
  desde: primerDiaDelMes(mes),
  hasta: ultimoDiaDelMes(mes),
  preset,
  mes,
});

/** Retrocede n meses desde un 'YYYY-MM'. */
const retroceder = (mes: string, n: number): string => {
  let actual = mes;
  for (let i = 0; i < n; i += 1) actual = mesAnterior(actual);
  return actual;
};

export const rangoDePreset = (preset: Preset, zona: string): Rango => {
  const hoy = mesActual(zona);

  switch (preset) {
    case 'mes':
      return rangoDeMes(hoy);

    case 'mes-anterior':
      return rangoDeMes(mesAnterior(hoy), 'mes-anterior');

    case 'ultimos-3':
      return { desde: primerDiaDelMes(retroceder(hoy, 2)), hasta: ultimoDiaDelMes(hoy), preset };

    case 'ultimos-6':
      return { desde: primerDiaDelMes(retroceder(hoy, 5)), hasta: ultimoDiaDelMes(hoy), preset };

    case 'ultimos-12':
      return { desde: primerDiaDelMes(retroceder(hoy, 11)), hasta: ultimoDiaDelMes(hoy), preset };

    case 'ano': {
      const year = hoy.slice(0, 4);
      return { desde: `${year}-01-01`, hasta: `${year}-12-31`, preset };
    }

    default:
      return rangoDeMes(hoy);
  }
};

/** Mes anterior o siguiente, solo cuando el rango ES un mes. */
export const desplazarMes = (rango: Rango, direccion: -1 | 1): Rango => {
  if (!rango.mes) return rango;
  const nuevo = direccion === -1 ? mesAnterior(rango.mes) : mesSiguiente(rango.mes);
  return rangoDeMes(nuevo);
};

export const ETIQUETAS_PRESET: Record<Preset, string> = {
  mes: 'Este mes',
  'mes-anterior': 'Mes pasado',
  'ultimos-3': 'Últimos 3 meses',
  'ultimos-6': 'Últimos 6 meses',
  'ultimos-12': 'Últimos 12 meses',
  ano: 'Este año',
  personalizado: 'Personalizado',
};

/** 'YYYY-MM-DD' → '3 de agosto'. Sin Date de por medio: es puro texto. */
const MESES = [
  '', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const diaLegible = (fecha: string, conAno = false): string => {
  const [year, month, day] = fecha.split('-').map(Number);
  if (!year || !month || !day) return fecha;
  return `${day} de ${MESES[month]}${conAno ? ` de ${year}` : ''}`;
};

/**
 * Cómo se nombra un rango.
 *
 * Un mes completo se dice por su nombre —«Agosto de 2026»— y no por sus
 * extremos: «del 1 al 31 de agosto» es la misma información contada peor.
 */
export const nombrarRango = (rango: Rango): string => {
  if (rango.mes) {
    const [year, month] = rango.mes.split('-').map(Number);
    const nombre = MESES[month ?? 0] ?? rango.mes;
    return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${year}`;
  }

  if (rango.preset !== 'personalizado') return ETIQUETAS_PRESET[rango.preset];

  const mismoAno = rango.desde.slice(0, 4) === rango.hasta.slice(0, 4);
  return `${diaLegible(rango.desde, !mismoAno)} – ${diaLegible(rango.hasta, true)}`;
};

/** Meses que abarca un rango, para la evolución. */
export const mesesDelRango = (rango: Rango): string[] => {
  const meses: string[] = [];
  let actual = rango.desde.slice(0, 7);
  const fin = rango.hasta.slice(0, 7);

  // Tope de seguridad: un rango absurdo no debe colgar la app.
  for (let i = 0; actual <= fin && i < 240; i += 1) {
    meses.push(actual);
    actual = mesSiguiente(actual);
  }

  return meses;
};

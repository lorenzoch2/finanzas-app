/**
 * Fechas con zona horaria explícita.
 *
 * El motivo de que este módulo exista: la app anterior usaba
 * `new Date().toISOString().slice(0, 7)` para el mes activo y `.slice(0, 16)`
 * para prellenar el formulario. Ambos operan en UTC, así que en Chile
 * (UTC-3/-4) el día 1 de cada mes antes de las 03:00 el dashboard mostraba el
 * mes anterior, y el formulario proponía una hora 3-4 h en el futuro.
 *
 * Aquí nada depende de la zona horaria de la máquina: siempre se pasa la zona
 * de forma explícita.
 *
 * La conversión "hora local -> instante UTC" es iterativa a propósito: el
 * offset de una zona depende del instante, y el instante es justamente lo que
 * estamos calculando. Dos o tres pasadas convergen, incluso en los saltos de
 * horario de verano.
 */

export const ZONA_POR_DEFECTO = 'America/Santiago';

export const ZONAS_DISPONIBLES = [
  { value: 'America/Santiago', label: 'Chile continental (America/Santiago)' },
  { value: 'America/Punta_Arenas', label: 'Chile austral (America/Punta_Arenas)' },
  { value: 'Pacific/Easter', label: 'Isla de Pascua (Pacific/Easter)' },
  { value: 'UTC', label: 'UTC' },
] as const;

export type MesKey = string; // 'YYYY-MM'

interface PartesFecha {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const pad = (valor: number): string => String(valor).padStart(2, '0');

const partesEnZona = (fecha: Date, zona: string): PartesFecha => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  })
    .formatToParts(fecha)
    .reduce<Record<string, string>>((acc, parte) => {
      if (parte.type !== 'literal') acc[parte.type] = parte.value;
      return acc;
    }, {});

  return {
    year: Number(partes['year']),
    month: Number(partes['month']),
    day: Number(partes['day']),
    hour: Number(partes['hour']),
    minute: Number(partes['minute']),
    second: Number(partes['second']),
  };
};

const offsetMinutos = (fecha: Date, zona: string): number => {
  const p = partesEnZona(fecha, zona);
  const utcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((utcMs - fecha.getTime()) / 60000);
};

/** Convierte una hora de pared en una zona al instante UTC que le corresponde. */
const paredAInstante = (p: PartesFecha, zona: string): Date => {
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  let instante = new Date(comoUtc);

  for (let i = 0; i < 4; i += 1) {
    const ajustado = new Date(comoUtc - offsetMinutos(instante, zona) * 60000);
    if (ajustado.getTime() === instante.getTime()) return ajustado;
    instante = ajustado;
  }

  return instante;
};

const parsearEntradaLocal = (valor: string): PartesFecha | null => {
  if (!valor) return null;

  const [fechaTexto, horaTexto = '00:00'] = valor.split('T');
  const [year, month, day] = (fechaTexto ?? '').split('-').map(Number);
  const [hour, minute] = horaTexto.split(':').map(Number);

  if (!year || !month || !day) return null;
  if (hour === undefined || minute === undefined) return null;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  return { year, month, day, hour, minute, second: 0 };
};

export const esZonaValida = (zona: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
};

/** Mes actual 'YYYY-MM' en la zona dada. El bug que arreglamos vivía aquí. */
export const mesActual = (zona: string, ahora = new Date()): MesKey => {
  const p = partesEnZona(ahora, zona);
  return `${p.year}-${pad(p.month)}`;
};

/** Valor para un <input type="datetime-local">, en hora de pared de la zona. */
export const paraInputDateTime = (fecha: Date, zona: string): string => {
  const p = partesEnZona(fecha, zona);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
};

/** Valor para un <input type="date">, en hora de pared de la zona. */
export const paraInputDate = (fecha: Date, zona: string): string => {
  const p = partesEnZona(fecha, zona);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY'. Sin Date de por medio: es puro texto. */
export const formatearFechaSola = (texto: string): string => {
  if (!texto) return '';
  const [year, month, day] = texto.split('-');
  if (!year || !month || !day) return texto;
  return `${day}/${month}/${year}`;
};

export const formatearFechaHora = (fecha: Date, zona: string, locale = 'es-CL'): string =>
  new Intl.DateTimeFormat(locale, { timeZone: zona, dateStyle: 'short', timeStyle: 'short' }).format(fecha);

/** Lo que escribió el usuario en un datetime-local -> ISO UTC para guardar. */
export const entradaDateTimeAIso = (valor: string, zona: string): string | null => {
  const partes = parsearEntradaLocal(valor);
  return partes ? paredAInstante(partes, zona).toISOString() : null;
};

export const entradaDateAIso = (valor: string, zona: string): string | null => {
  const partes = parsearEntradaLocal(`${valor}T00:00`);
  return partes ? paredAInstante(partes, zona).toISOString() : null;
};

/** Rango [inicio, fin) del mes, como instantes UTC. */
export const rangoDelMes = (mes: MesKey, zona: string): { inicio: string; fin: string } | null => {
  const [year, month] = mes.split('-').map(Number);
  if (!year || !month) return null;

  const siguiente = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

  const inicio = entradaDateAIso(`${year}-${pad(month)}-01`, zona);
  const fin = entradaDateAIso(`${siguiente.year}-${pad(siguiente.month)}-01`, zona);

  return inicio && fin ? { inicio, fin } : null;
};

/** Primer día del mes como 'YYYY-MM-DD', que es lo que esperan los RPC. */
export const primerDiaDelMes = (mes: MesKey): string => `${mes}-01`;

export const mesAnterior = (mes: MesKey): MesKey => {
  const [year, month] = mes.split('-').map(Number);
  if (!year || !month) return mes;
  return month === 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
};

export const mesSiguiente = (mes: MesKey): MesKey => {
  const [year, month] = mes.split('-').map(Number);
  if (!year || !month) return mes;
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
};

export const formatearMes = (mes: MesKey, locale = 'es-CL'): string => {
  const [year, month] = mes.split('-').map(Number);
  if (!year || !month) return mes;

  const texto = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));

  // Solo la primera letra. La clase `capitalize` de CSS ponia mayuscula a cada
  // palabra y producia «Agosto De 2026», con la preposicion en mayuscula.
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

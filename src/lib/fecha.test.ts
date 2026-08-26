import { describe, expect, it } from 'vitest';
import {
  ZONA_POR_DEFECTO,
  entradaDateAIso,
  entradaDateTimeAIso,
  esZonaValida,
  formatearFechaSola,
  mesActual,
  mesAnterior,
  mesSiguiente,
  paraInputDate,
  paraInputDateTime,
  primerDiaDelMes,
  rangoDelMes,
} from './fecha';

describe('mesActual', () => {
  /**
   * Este es EL bug de la versión anterior.
   *
   * `new Date().toISOString().slice(0, 7)` opera en UTC. El 1 de julio a las
   * 00:30 en Santiago son las 04:30 UTC del 1 de julio, así que ese caso se
   * salvaba. Pero el 1 de julio a las 00:30 *UTC* son las 20:30 del 30 de junio
   * en Santiago: quien abría la app en ese momento veía julio cuando todavía
   * era junio, y al revés en el otro extremo del día.
   *
   * El caso que rompía de verdad: 31 de julio 21:30 en Santiago = 1 de agosto
   * 00:30 UTC. La app mostraba agosto estando aún en julio.
   */
  it('usa el mes de la zona pedida, no el de UTC', () => {
    // 1 de agosto de 2026, 00:30 UTC.
    const instante = new Date('2026-08-01T00:30:00Z');

    // En UTC ya es agosto...
    expect(instante.toISOString().slice(0, 7)).toBe('2026-08');

    // ...pero en Santiago (UTC-4) todavía es 31 de julio.
    expect(mesActual('America/Santiago', instante)).toBe('2026-07');
    expect(mesActual('UTC', instante)).toBe('2026-08');
  });

  it('acierta el primer día del mes en horario chileno', () => {
    // 1 de agosto de 2026, 00:30 en Santiago = 04:30 UTC.
    const instante = new Date('2026-08-01T04:30:00Z');
    expect(mesActual('America/Santiago', instante)).toBe('2026-08');
  });
});

describe('ida y vuelta entre hora de pared e instante', () => {
  it('conserva lo que el usuario escribió', () => {
    const escrito = '2026-08-15T14:30';
    const iso = entradaDateTimeAIso(escrito, ZONA_POR_DEFECTO);

    expect(iso).not.toBeNull();
    expect(paraInputDateTime(new Date(iso as string), ZONA_POR_DEFECTO)).toBe(escrito);
  });

  it('convierte medianoche local al instante UTC correcto', () => {
    // Santiago en agosto está en UTC-4 (horario de invierno).
    expect(entradaDateAIso('2026-08-15', 'America/Santiago')).toBe('2026-08-15T04:00:00.000Z');
    expect(entradaDateAIso('2026-08-15', 'UTC')).toBe('2026-08-15T00:00:00.000Z');
  });

  it('sigue funcionando a través del cambio de horario', () => {
    // Chile adelanta la hora a comienzos de septiembre. En el día del salto la
    // medianoche local no existe, así que no se puede exigir un round-trip
    // exacto: lo que sí debe cumplirse es que cada día produzca un instante
    // válido y estrictamente posterior al anterior. Un salto mal resuelto se
    // manifestaría como dos días cayendo en el mismo instante, o en orden
    // invertido.
    const dias = ['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'];
    const instantes = dias.map((dia) => {
      const iso = entradaDateAIso(dia, 'America/Santiago');
      expect(iso).not.toBeNull();
      return new Date(iso as string).getTime();
    });

    for (let i = 1; i < instantes.length; i += 1) {
      expect(instantes[i]).toBeGreaterThan(instantes[i - 1] as number);
      // Días consecutivos distan 23, 24 o 25 horas según el cambio de horario.
      const horas = ((instantes[i] as number) - (instantes[i - 1] as number)) / 3_600_000;
      expect(horas).toBeGreaterThanOrEqual(23);
      expect(horas).toBeLessThanOrEqual(25);
    }
  });

  it('hace round-trip exacto en días sin cambio de horario', () => {
    for (const dia of ['2026-08-01', '2026-08-15', '2026-08-31', '2026-10-20']) {
      const iso = entradaDateAIso(dia, 'America/Santiago');
      expect(paraInputDate(new Date(iso as string), 'America/Santiago')).toBe(dia);
    }
  });

  it('devuelve null ante entrada inválida en vez de una fecha inventada', () => {
    expect(entradaDateTimeAIso('', ZONA_POR_DEFECTO)).toBeNull();
    expect(entradaDateTimeAIso('no es fecha', ZONA_POR_DEFECTO)).toBeNull();
    expect(entradaDateAIso('2026-13', ZONA_POR_DEFECTO)).toBeNull();
  });
});

describe('rangoDelMes', () => {
  it('cubre el mes completo en hora local, sin solaparse con el siguiente', () => {
    const rango = rangoDelMes('2026-08', 'America/Santiago');
    expect(rango).not.toBeNull();
    expect(rango?.inicio).toBe('2026-08-01T04:00:00.000Z');
    expect(rango?.fin).toBe('2026-09-01T04:00:00.000Z');
  });

  it('cruza bien el fin de año', () => {
    const rango = rangoDelMes('2026-12', 'America/Santiago');
    expect(rango?.fin.slice(0, 7)).toBe('2027-01');
  });
});

describe('navegación de meses', () => {
  it('retrocede y avanza cruzando el año', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSiguiente('2026-12')).toBe('2027-01');
    expect(mesAnterior('2026-08')).toBe('2026-07');
    expect(mesSiguiente('2026-08')).toBe('2026-09');
  });

  it('primerDiaDelMes arma lo que esperan los RPC', () => {
    expect(primerDiaDelMes('2026-08')).toBe('2026-08-01');
  });
});

describe('utilidades', () => {
  it('formatea una fecha sola sin pasar por Date', () => {
    // Pasar '2026-08-15' por `new Date()` lo interpreta como UTC y en Chile
    // muestra el día 14. Por eso esto es puro texto.
    expect(formatearFechaSola('2026-08-15')).toBe('15/08/2026');
    expect(formatearFechaSola('')).toBe('');
  });

  it('reconoce zonas válidas e inválidas', () => {
    expect(esZonaValida('America/Santiago')).toBe(true);
    expect(esZonaValida('Marte/Olympus')).toBe(false);
  });
});
